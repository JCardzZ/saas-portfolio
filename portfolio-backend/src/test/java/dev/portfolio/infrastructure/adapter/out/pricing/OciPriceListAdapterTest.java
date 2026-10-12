package dev.portfolio.infrastructure.adapter.out.pricing;

import dev.portfolio.application.port.out.TelemetryPort;
import dev.portfolio.domain.exception.PricingUnavailableException;
import dev.portfolio.domain.model.CloudProviderDomain;
import dev.portfolio.domain.model.TelemetryEventType;
import dev.portfolio.domain.model.pricing.Money;
import dev.portfolio.domain.model.pricing.PriceQuote;
import dev.portfolio.domain.model.pricing.PricingStatus;
import dev.portfolio.domain.model.pricing.PricingUnit;
import io.github.resilience4j.circuitbreaker.CircuitBreaker;
import io.github.resilience4j.circuitbreaker.CircuitBreakerConfig;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;

import static dev.portfolio.domain.model.CloudProviderDomain.OCI;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.queryParam;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class OciPriceListAdapterTest {

    private static final String BASE_URL = "https://prices.test/api/v1/products/";
    private static final Instant NOW = Instant.parse("2026-10-11T12:00:00Z");

    /** Producto tal como lo devuelve la lista real para una OCPU Standard E5 (2026-10-11). */
    private static String product(String partNumber, String displayName, String metricName, String prices) {
        return """
                {"partNumber":"%s","displayName":"%s","metricName":"%s","serviceCategory":"Compute - Virtual Machine",
                 "currencyCodeLocalizations":[{"currencyCode":"USD","prices":[%s]}]}""".formatted(partNumber, displayName, metricName, prices);
    }

    private static String body(String... products) {
        return "{\"lastUpdated\":\"2026-10-08T14:38:16.165Z\",\"items\":[" + String.join(",", products) + "]}";
    }

    private static String payAsYouGo(String value) {
        return "{\"model\":\"PAY_AS_YOU_GO\",\"value\":" + value + "}";
    }

    private static final String E5 = product("B97384", "Compute - Standard - E5 - OCPU", "OCPU Per Hour", payAsYouGo("0.03"));

    private final List<String> telemetry = new ArrayList<>();
    private final TelemetryPort telemetryPort = new TelemetryPort() {
        @Override
        public void publish(TelemetryEventType type, String details, String traceId) {
            telemetry.add(type + " " + details);
        }
    };
    private MockRestServiceServer server;
    private CircuitBreaker circuitBreaker;
    private OciPriceListAdapter adapter;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder().baseUrl(BASE_URL);
        server = MockRestServiceServer.bindTo(builder).build();
        circuitBreaker = CircuitBreaker.of("ociPricing", CircuitBreakerConfig.custom()
                .slidingWindowType(CircuitBreakerConfig.SlidingWindowType.COUNT_BASED).slidingWindowSize(4).minimumNumberOfCalls(4)
                .failureRateThreshold(50).waitDurationInOpenState(Duration.ofMinutes(1)).build());
        adapter = new OciPriceListAdapter(builder.build(), circuitBreaker, telemetryPort, Clock.fixed(NOW, ZoneOffset.UTC));
    }

    @Test
    void supportsOnlyTheOracleServicesWithAMappedPartNumber() {
        assertThat(adapter.supports(OCI, "vm")).isTrue();
        assertThat(adapter.supports(OCI, "postgres")).isTrue();
        assertThat(adapter.supports(OCI, "warehouse")).isTrue();
        // Con tramo gratuito o de pago por petición: no hay «un» precio por hora.
        assertThat(adapter.supports(OCI, "functions")).isFalse();
        assertThat(adapter.supports(OCI, "queue")).isFalse();
        assertThat(adapter.supports(CloudProviderDomain.AZURE, "vm")).isFalse();
        assertThatThrownBy(() -> adapter.quote(CloudProviderDomain.AWS, "vm")).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void asksForOnePartNumberAndReturnsItsListPrice() {
        server.expect(requestTo(startsWith(BASE_URL)))
                .andExpect(method(HttpMethod.GET))
                .andExpect(queryParam("partNumber", "B97384"))
                .andExpect(queryParam("currencyCode", "USD"))
                .andRespond(withSuccess(body(E5), MediaType.APPLICATION_JSON));

        PriceQuote quote = adapter.quote(OCI, "vm");

        assertThat(quote.status()).isEqualTo(PricingStatus.LIVE);
        assertThat(quote.serviceCode()).isEqualTo("vm");
        assertThat(quote.pricing().sku()).isEqualTo("Standard E5 OCPU");
        assertThat(quote.pricing().unitPrice()).isEqualTo(Money.usd("0.03"));
        assertThat(quote.pricing().unit()).isEqualTo(PricingUnit.HOURLY);
        assertThat(quote.pricing().monthlyCost()).contains(Money.usd("21.90"));
        assertThat(quote.pricing().description()).isEqualTo("Compute - Standard - E5 - OCPU · OCPU Per Hour");
        assertThat(quote.pricing().source()).isEqualTo("Oracle Cloud Price List API");
        assertThat(quote.pricing().fetchedAt()).isEqualTo(NOW);
        assertThat(quote.note()).contains("La memoria se factura aparte");
        assertThat(telemetry).containsExactly("PRICING_REQUEST Dispatching GET to Oracle Cloud Price List for part 'B97384'...");
        server.verify();
    }

    @Test
    void takesOnlyTheProductItAskedFor() {
        server.expect(requestTo(startsWith(BASE_URL))).andRespond(withSuccess(body(
                product("B98202", "Oracle Cloud Infrastructure - Compute - Dense I/O - E5 OCPU", "OCPU Per Hour", payAsYouGo("0.99")), E5),
                MediaType.APPLICATION_JSON));

        assertThat(adapter.quote(OCI, "vm").pricing().unitPrice()).isEqualTo(Money.usd("0.03"));
    }

    @Test
    void refusesAnAnswerItCannotTrustInsteadOfGuessing() {
        for (String answer : List.of(
                body(), // el número de parte ya no existe
                body(product("B97384", "Compute - Standard - E6 - OCPU", "OCPU Per Hour", payAsYouGo("0.03"))), // el número de parte es ya otro producto
                body(product("B97384", "Compute - Standard - E5 - OCPU", "OCPU Per Month", payAsYouGo("0.03"))), // otra unidad
                body(product("B97384", "Compute - Standard - E5 - OCPU", "OCPU Per Hour", payAsYouGo("0"))), // sin precio
                body(product("B97384", "Compute - Standard - E5 - OCPU", "OCPU Per Hour", payAsYouGo("0") + "," + payAsYouGo("0.03"))), // por tramos
                body(product("B97384", "Compute - Standard - E5 - OCPU", "OCPU Per Hour", "{\"model\":\"MONTHLY_COMMIT\",\"value\":0.02}")),
                "{}")) {
            server.reset();
            server.expect(requestTo(startsWith(BASE_URL))).andRespond(withSuccess(answer, MediaType.APPLICATION_JSON));

            assertThatThrownBy(() -> adapter.quote(OCI, "vm")).as(answer).isInstanceOf(PricingUnavailableException.class);
        }
    }

    @Test
    void stopsCallingWhenTheProviderKeepsFailing() {
        for (int call = 0; call < 4; call++) {
            server.reset();
            server.expect(requestTo(startsWith(BASE_URL))).andRespond(withStatus(HttpStatus.SERVICE_UNAVAILABLE));
            assertThatThrownBy(() -> adapter.quote(OCI, "vm")).isInstanceOf(PricingUnavailableException.class);
        }
        assertThat(circuitBreaker.getState()).isEqualTo(CircuitBreaker.State.OPEN);

        // Con el circuito abierto ya no sale ninguna petición.
        server.reset();
        assertThatThrownBy(() -> adapter.quote(OCI, "vm")).isInstanceOf(PricingUnavailableException.class).hasMessageContaining("abierto");
        server.verify();
    }
}
