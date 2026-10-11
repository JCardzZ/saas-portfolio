package dev.portfolio.infrastructure.adapter.out.pricing;

import dev.portfolio.application.port.out.TelemetryPort;
import dev.portfolio.domain.exception.PricingUnavailableException;
import dev.portfolio.domain.model.CloudProviderDomain;
import dev.portfolio.domain.model.TelemetryEventType;
import dev.portfolio.domain.model.pricing.Money;
import dev.portfolio.domain.model.pricing.PriceQuote;
import dev.portfolio.domain.model.pricing.PricingStatus;
import dev.portfolio.domain.model.pricing.PricingUnit;
import dev.portfolio.infrastructure.adapter.out.pricing.GcpPricingApiAdapter.GcpSku;
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
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static dev.portfolio.domain.model.CloudProviderDomain.GCP;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class GcpPricingApiAdapterTest {

    private static final String BASE_URL = "https://billing.test";
    // SKU de ejemplo de la documentación de la Pricing API; el servicio al que se asigna aquí es solo del test.
    private static final String SKU_ID = "0012-B7F2-DD14";
    private static final String URL = BASE_URL + "/v1beta/skus/" + SKU_ID + "/price?key=test-key&currencyCode=USD";
    private static final Instant NOW = Instant.parse("2026-10-10T12:00:00Z");

    /** Respuesta con la forma del ejemplo de la documentación ({@code skus.price.get}). */
    private static String price(String tiers, String unit) {
        return """
                {"name":"skus/%s/price","currencyCode":"USD","valueType":"rate","rate":{"tiers":[%s],
                 "unitInfo":{"unit":"%s","unitDescription":"hour","unitQuantity":{"value":"1"}},
                 "aggregationInfo":{"level":"ACCOUNT","interval":"MONTHLY"}}}""".formatted(SKU_ID, tiers, unit);
    }

    private static String tier(String start, String listPrice) {
        return "{\"startAmount\":{\"value\":\"%s\"},\"listPrice\":{\"currencyCode\":\"USD\",%s}}".formatted(start, listPrice);
    }

    private final List<String> telemetry = new ArrayList<>();
    private final TelemetryPort telemetryPort = new TelemetryPort() {
        @Override
        public void publish(TelemetryEventType type, String details, String traceId) {
            telemetry.add(type + " " + details);
        }
    };
    private MockRestServiceServer server;
    private GcpPricingApiAdapter adapter;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder().baseUrl(BASE_URL);
        server = MockRestServiceServer.bindTo(builder).build();
        Map<String, GcpSku> skus = new HashMap<>();
        skus.put("kubernetes", new GcpSku(SKU_ID, "GKE cluster", "Solo la gestión del clúster."));
        skus.put("redis", new GcpSku("https://evil.test/x", "Redis", "nota"));
        skus.put("postgres", new GcpSku("0012-B7F2-DD15", "", "nota"));
        adapter = new GcpPricingApiAdapter(builder.build(), "test-key", skus, "us-east1",
                CircuitBreaker.of("gcpPricing", CircuitBreakerConfig.ofDefaults()), telemetryPort, Clock.fixed(NOW, ZoneOffset.UTC));
    }

    @Test
    void supportsOnlyServicesWithAWellFormedConfiguredSku() {
        assertThat(adapter.supports(GCP, "kubernetes")).isTrue();
        assertThat(adapter.supports(GCP, "redis")).isFalse();
        assertThat(adapter.supports(GCP, "postgres")).isFalse();
        assertThat(adapter.supports(GCP, "vm")).isFalse();
        assertThat(adapter.supports(CloudProviderDomain.AWS, "kubernetes")).isFalse();
        assertThatThrownBy(() -> adapter.quote(CloudProviderDomain.AWS, "kubernetes")).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void asksForTheConfiguredSkuAndReturnsItsHourlyListPrice() {
        server.expect(requestTo(URL)).andExpect(method(HttpMethod.GET))
                .andRespond(withSuccess(price(tier("0", "\"nanos\":100000000"), "h"), MediaType.APPLICATION_JSON));

        PriceQuote quote = adapter.quote(GCP, "kubernetes");

        assertThat(quote.status()).isEqualTo(PricingStatus.LIVE);
        assertThat(quote.pricing().sku()).isEqualTo("GKE cluster");
        assertThat(quote.pricing().unitPrice()).isEqualTo(Money.usd("0.1"));
        assertThat(quote.pricing().unit()).isEqualTo(PricingUnit.HOURLY);
        assertThat(quote.pricing().monthlyCost()).contains(Money.usd("73"));
        assertThat(quote.pricing().description()).isEqualTo("SKU " + SKU_ID);
        assertThat(quote.pricing().source()).isEqualTo("Google Cloud Pricing API");
        assertThat(quote.pricing().fetchedAt()).isEqualTo(NOW);
        assertThat(quote.note()).isEqualTo("Solo la gestión del clúster.");
        assertThat(telemetry).containsExactly("PRICING_REQUEST Dispatching GET to Google Cloud Pricing API for SKU 'GKE cluster'...");
        assertThat(telemetry.toString()).doesNotContain("test-key");
        server.verify();
    }

    @Test
    void addsWholeUnitsAndNanos() {
        server.expect(requestTo(URL))
                .andRespond(withSuccess(price(tier("0", "\"units\":\"1\",\"nanos\":250000000"), "h"), MediaType.APPLICATION_JSON));

        assertThat(adapter.quote(GCP, "kubernetes").pricing().unitPrice()).isEqualTo(Money.usd("1.25"));
    }

    @Test
    void rejectsWhatIsNotASingleHourlyTierFromZero() {
        server.expect(requestTo(URL)).andRespond(withSuccess(price(tier("0", "\"nanos\":1397000"), "GiBy.h"), MediaType.APPLICATION_JSON));
        assertThatThrownBy(() -> adapter.quote(GCP, "kubernetes")).isInstanceOf(PricingUnavailableException.class);

        server.reset();
        server.expect(requestTo(URL)).andRespond(withSuccess(
                price(tier("0", "\"nanos\":0") + "," + tier("100", "\"nanos\":100000000"), "h"), MediaType.APPLICATION_JSON));
        assertThatThrownBy(() -> adapter.quote(GCP, "kubernetes")).isInstanceOf(PricingUnavailableException.class);

        server.reset();
        server.expect(requestTo(URL)).andRespond(withSuccess(price(tier("0", "\"nanos\":0"), "h"), MediaType.APPLICATION_JSON));
        assertThatThrownBy(() -> adapter.quote(GCP, "kubernetes")).isInstanceOf(PricingUnavailableException.class);
    }

    @Test
    void aProviderErrorNeverLeaksTheKey() {
        server.expect(requestTo(URL)).andRespond(withStatus(HttpStatus.FORBIDDEN));

        assertThatThrownBy(() -> adapter.quote(GCP, "kubernetes")).isInstanceOf(PricingUnavailableException.class)
                .satisfies(error -> {
                    assertThat(error.getMessage()).doesNotContain("test-key");
                    assertThat(error.getCause()).isNull();
                });
    }
}
