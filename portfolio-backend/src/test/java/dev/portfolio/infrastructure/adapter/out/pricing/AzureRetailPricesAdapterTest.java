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
import org.springframework.test.web.client.ExpectedCount;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;

import static dev.portfolio.domain.model.CloudProviderDomain.AZURE;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.queryParam;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;
import static org.hamcrest.Matchers.startsWith;

class AzureRetailPricesAdapterTest {

    private static final String BASE_URL = "https://prices.test/api/retail/prices";
    private static final Instant NOW = Instant.parse("2026-10-10T12:00:00Z");

    /** Fila tal como la devuelve la API real para el medidor de una D2s v5 con Linux en eastus (2026-10-10). */
    private static String item(String productName, String skuName, String meterName, String price, String unit, String type, String region) {
        return """
                {"currencyCode":"USD","tierMinimumUnits":0.0,"retailPrice":%s,"unitPrice":%s,"armRegionName":"%s","location":"US East",
                 "effectiveStartDate":"2021-11-01T00:00:00Z","meterId":"x","meterName":"%s","productId":"DZH318Z08M22","skuId":"DZH318Z08M22/000F",
                 "productName":"%s","skuName":"%s","serviceName":"Virtual Machines","serviceId":"DZH313Z7MMC8","serviceFamily":"Compute",
                 "unitOfMeasure":"%s","type":"%s","isPrimaryMeterRegion":true,"armSkuName":"Standard_D2s_v5"}"""
                .formatted(price, price, region, meterName, productName, skuName, unit, type);
    }

    private static String body(String... items) {
        return "{\"BillingCurrency\":\"USD\",\"CustomerEntityId\":\"Default\",\"Items\":[" + String.join(",", items) + "],\"NextPageLink\":null,\"Count\":" + items.length + "}";
    }

    private static final String D2S_V5 = item("Virtual Machines Dsv5 Series", "Standard_D2s_v5", "D2s v5", "0.096", "1 Hour", "Consumption", "eastus");

    private final List<String> telemetry = new ArrayList<>();
    private final TelemetryPort telemetryPort = new TelemetryPort() {
        @Override
        public void publish(TelemetryEventType type, String details, String traceId) {
            telemetry.add(type + " " + details);
        }
    };
    private MockRestServiceServer server;
    private CircuitBreaker circuitBreaker;
    private AzureRetailPricesAdapter adapter;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder().baseUrl(BASE_URL);
        server = MockRestServiceServer.bindTo(builder).build();
        circuitBreaker = CircuitBreaker.of("azurePricing", CircuitBreakerConfig.custom()
                .slidingWindowType(CircuitBreakerConfig.SlidingWindowType.COUNT_BASED).slidingWindowSize(4).minimumNumberOfCalls(4)
                .failureRateThreshold(50).waitDurationInOpenState(Duration.ofMinutes(1)).build());
        adapter = new AzureRetailPricesAdapter(builder.build(), "eastus", circuitBreaker, telemetryPort, Clock.fixed(NOW, ZoneOffset.UTC));
    }

    @Test
    void supportsOnlyTheAzureServicesWithAMappedSku() {
        assertThat(adapter.supports(AZURE, "vm")).isTrue();
        assertThat(adapter.supports(AZURE, "postgres")).isTrue();
        assertThat(adapter.supports(AZURE, "functions")).isFalse();
        assertThat(adapter.supports(AZURE, "snowflake")).isFalse();
        assertThat(adapter.supports(CloudProviderDomain.AWS, "vm")).isFalse();
        assertThatThrownBy(() -> adapter.quote(CloudProviderDomain.AWS, "vm")).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void asksForOneExactMeterAndReturnsItsListPrice() {
        server.expect(requestTo(startsWith(BASE_URL)))
                .andExpect(method(HttpMethod.GET))
                .andExpect(queryParam("$filter", org.hamcrest.Matchers.anything()))
                .andExpect(request -> assertThat(java.net.URLDecoder.decode(request.getURI().getRawQuery(), java.nio.charset.StandardCharsets.UTF_8))
                        .isEqualTo("$filter=serviceName eq 'Virtual Machines' and armRegionName eq 'eastus' and priceType eq 'Consumption'"
                                + " and productName eq 'Virtual Machines Dsv5 Series' and skuName eq 'Standard_D2s_v5' and meterName eq 'D2s v5'"))
                .andRespond(withSuccess(body(D2S_V5), MediaType.APPLICATION_JSON));

        PriceQuote quote = adapter.quote(AZURE, "vm");

        assertThat(quote.status()).isEqualTo(PricingStatus.LIVE);
        assertThat(quote.serviceCode()).isEqualTo("vm");
        assertThat(quote.pricing().sku()).isEqualTo("D2s_v5");
        assertThat(quote.pricing().unitPrice()).isEqualTo(Money.usd("0.096"));
        assertThat(quote.pricing().unit()).isEqualTo(PricingUnit.HOURLY);
        assertThat(quote.pricing().monthlyCost()).contains(Money.usd("70.08"));
        assertThat(quote.pricing().description()).isEqualTo("Virtual Machines Dsv5 Series · D2s v5");
        assertThat(quote.pricing().region()).isEqualTo("eastus");
        assertThat(quote.pricing().source()).isEqualTo("Azure Retail Prices API");
        assertThat(quote.pricing().fetchedAt()).isEqualTo(NOW);
        assertThat(quote.note()).contains("No incluye disco");
        assertThat(telemetry).containsExactly("PRICING_REQUEST Dispatching GET to Azure Retail API for SKU 'D2s_v5'...");
        server.verify();
    }

    @Test
    void takesOnlyTheRowItAskedForEvenIfTheApiReturnsOthers() {
        server.expect(requestTo(startsWith(BASE_URL))).andRespond(withSuccess(body(
                item("Virtual Machines Dsv5 Series Windows", "Standard_D2s_v5", "D2s v5", "0.188", "1 Hour", "Consumption", "eastus"),
                item("Virtual Machines Dsv5 Series", "Standard_D2s_v5 Spot", "D2s v5 Spot", "0.020266", "1 Hour", "Consumption", "eastus"),
                item("Virtual Machines Dsv5 Series", "Standard_D2s_v5", "D2s v5", "0.05", "1 Hour", "Reservation", "eastus"),
                item("Virtual Machines Dsv5 Series", "Standard_D2s_v5", "D2s v5", "0.11", "1 Hour", "Consumption", "westeurope"),
                D2S_V5), MediaType.APPLICATION_JSON));

        assertThat(adapter.quote(AZURE, "vm").pricing().unitPrice()).isEqualTo(Money.usd("0.096"));
    }

    @Test
    void refusesAnAnswerItCannotTrustInsteadOfGuessing() {
        for (String answer : List.of(
                body(), // el medidor ya no existe
                body(item("Virtual Machines Dsv5 Series", "Standard_D2s_v5", "D2s v5", "0.096", "1 Month", "Consumption", "eastus")), // otra unidad
                body(item("Virtual Machines Dsv5 Series", "Standard_D2s_v5", "D2s v5", "0", "1 Hour", "Consumption", "eastus")), // sin precio
                body(item("Virtual Machines Dsv5 Series", "Standard_D2s_v5", "D2s v5", "-1", "1 Hour", "Consumption", "eastus")),
                "{}")) {
            server.reset();
            server.expect(requestTo(startsWith(BASE_URL))).andRespond(withSuccess(answer, MediaType.APPLICATION_JSON));

            assertThatThrownBy(() -> adapter.quote(AZURE, "vm")).as(answer).isInstanceOf(PricingUnavailableException.class);
        }
    }

    @Test
    void turnsAProviderErrorIntoPricingUnavailable() {
        for (HttpStatus status : List.of(HttpStatus.TOO_MANY_REQUESTS, HttpStatus.INTERNAL_SERVER_ERROR, HttpStatus.BAD_REQUEST)) {
            server.reset();
            server.expect(requestTo(startsWith(BASE_URL))).andRespond(withStatus(status));

            assertThatThrownBy(() -> adapter.quote(AZURE, "vm")).as("%s", status).isInstanceOf(PricingUnavailableException.class);
        }
        server.reset();
        server.expect(requestTo(startsWith(BASE_URL))).andRespond(withSuccess("esto no es JSON", MediaType.APPLICATION_JSON));
        assertThatThrownBy(() -> adapter.quote(AZURE, "vm")).isInstanceOf(PricingUnavailableException.class);
    }

    @Test
    void stopsCallingTheProviderOnceTheCircuitOpens() {
        server.expect(ExpectedCount.times(4), requestTo(startsWith(BASE_URL))).andRespond(withStatus(HttpStatus.SERVICE_UNAVAILABLE));

        for (int attempt = 0; attempt < 6; attempt++) {
            assertThatThrownBy(() -> adapter.quote(AZURE, "vm")).isInstanceOf(PricingUnavailableException.class);
        }

        assertThat(circuitBreaker.getState()).isEqualTo(CircuitBreaker.State.OPEN);
        server.verify(); // cuatro llamadas reales; las dos últimas ni salieron
    }
}
