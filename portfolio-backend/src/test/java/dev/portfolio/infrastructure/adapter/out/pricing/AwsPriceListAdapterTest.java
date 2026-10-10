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

import static dev.portfolio.domain.model.CloudProviderDomain.AWS;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class AwsPriceListAdapterTest {

    private static final String BASE_URL = "https://pricing.test";
    private static final String ELASTICACHE = BASE_URL + "/offers/v1.0/aws/AmazonElastiCache/current/us-east-1/index.json";
    private static final Instant NOW = Instant.parse("2026-10-10T12:00:00Z");

    /** Producto con la forma del fichero real de ElastiCache en us-east-1 (2026-10-10). */
    private static String product(String id, String engine, String usageType) {
        return """
                "%s":{"sku":"%s","productFamily":"Cache Instance","attributes":{"servicecode":"AmazonElastiCache",
                "location":"US East (N. Virginia)","locationType":"AWS Region","instanceType":"cache.t4g.small","memory":"1.37 GiB",
                "cacheEngine":"%s","usagetype":"%s","operation":"CreateCacheCluster:0002","regionCode":"us-east-1"}}"""
                .formatted(id, id, engine, usageType);
    }

    private static String term(String id, String unit, String price) {
        return """
                "%s":{"%s.JRTCKXETXF":{"offerTermCode":"JRTCKXETXF","sku":"%s","effectiveDate":"2026-09-01T00:00:00Z",
                "priceDimensions":{"%s.JRTCKXETXF.6YS6EN2CT7":{"description":"$%s per T4G Small Cache node-hour (or partial hour)",
                "beginRange":"0","endRange":"Inf","unit":"%s","pricePerUnit":{"USD":"%s"},"appliesTo":[]}},"termAttributes":{}}}"""
                .formatted(id, id, id, id, price, unit, price);
    }

    private static String file(List<String> products, List<String> onDemand, List<String> reserved) {
        return "{\"formatVersion\":\"v1.0\",\"disclaimer\":\"…\",\"offerCode\":\"AmazonElastiCache\",\"products\":{" + String.join(",", products)
                + "},\"terms\":{\"OnDemand\":{" + String.join(",", onDemand) + "},\"Reserved\":{" + String.join(",", reserved)
                + "}},\"attributesList\":{}}";
    }

    private static final String REDIS = product("BYFG57CPZSFUXSSY", "Redis", "NodeUsage:cache.t4g.small");
    private static final String MEMCACHED = product("J9WDC3KZP76P2PNY", "Memcached", "NodeUsage:cache.t4g.small");
    private static final String VALKEY = product("SWRGTJTDUJ972J3G", "Valkey", "NodeUsage:cache.t4g.small");
    private static final String EXTENDED = product("638DBVAAJ7GFJZTX", "Redis", "USE1-ExtendedSupportYr3-NodeUsage:cache.t4g.small");

    private final List<String> telemetry = new ArrayList<>();
    private final TelemetryPort telemetryPort = new TelemetryPort() {
        @Override
        public void publish(TelemetryEventType type, String details, String traceId) {
            telemetry.add(type + " " + details);
        }
    };
    private MockRestServiceServer server;
    private AwsPriceListAdapter adapter;

    @BeforeEach
    void setUp() {
        adapter = adapter(1_000_000);
    }

    private AwsPriceListAdapter adapter(long maxBytes) {
        RestClient.Builder builder = RestClient.builder().baseUrl(BASE_URL);
        server = MockRestServiceServer.bindTo(builder).build();
        CircuitBreaker circuitBreaker = CircuitBreaker.of("awsPricing", CircuitBreakerConfig.custom()
                .slidingWindowType(CircuitBreakerConfig.SlidingWindowType.COUNT_BASED).slidingWindowSize(4).minimumNumberOfCalls(4)
                .failureRateThreshold(50).waitDurationInOpenState(Duration.ofMinutes(1)).build());
        return new AwsPriceListAdapter(builder.build(), maxBytes, circuitBreaker, telemetryPort, Clock.fixed(NOW, ZoneOffset.UTC));
    }

    @Test
    void supportsOnlyTheAwsServicesWithAMappedPrice() {
        assertThat(adapter.supports(AWS, "redis")).isTrue();
        assertThat(adapter.supports(AWS, "postgres")).isTrue();
        assertThat(adapter.supports(AWS, "kubernetes")).isTrue();
        // El fichero de EC2 es demasiado grande para leerlo en una petición: sin tarifa, no una aproximada.
        assertThat(adapter.supports(AWS, "vm")).isFalse();
        assertThat(adapter.supports(AWS, "snowflake")).isFalse();
        assertThat(adapter.supports(CloudProviderDomain.AZURE, "redis")).isFalse();
        assertThatThrownBy(() -> adapter.quote(CloudProviderDomain.GCP, "redis")).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void readsTheOnDemandPriceOfTheOneMatchingProduct() {
        server.expect(requestTo(ELASTICACHE)).andExpect(method(HttpMethod.GET)).andRespond(withSuccess(file(
                List.of(MEMCACHED, EXTENDED, REDIS, VALKEY),
                List.of(term("J9WDC3KZP76P2PNY", "Hrs", "0.0320000000"), term("638DBVAAJ7GFJZTX", "Hrs", "0.0640000000"),
                        term("BYFG57CPZSFUXSSY", "Hrs", "0.0320000000"), term("SWRGTJTDUJ972J3G", "Hrs", "0.0256000000")),
                List.of(term("BYFG57CPZSFUXSSY", "Hrs", "0.0200000000"))), MediaType.APPLICATION_JSON));

        PriceQuote quote = adapter.quote(AWS, "redis");

        assertThat(quote.status()).isEqualTo(PricingStatus.LIVE);
        assertThat(quote.serviceCode()).isEqualTo("redis");
        assertThat(quote.pricing().sku()).isEqualTo("cache.t4g.small");
        assertThat(quote.pricing().unitPrice()).isEqualTo(Money.usd("0.032"));
        assertThat(quote.pricing().unit()).isEqualTo(PricingUnit.HOURLY);
        assertThat(quote.pricing().monthlyCost()).contains(Money.usd("23.36"));
        assertThat(quote.pricing().region()).isEqualTo("us-east-1");
        assertThat(quote.pricing().source()).isEqualTo("AWS Price List (Bulk API)");
        assertThat(quote.pricing().fetchedAt()).isEqualTo(NOW);
        assertThat(quote.note()).contains("sin réplica");
        assertThat(telemetry).containsExactly("PRICING_REQUEST Dispatching GET to AWS Price List for SKU 'cache.t4g.small'...");
        server.verify();
    }

    @Test
    void refusesToChooseWhenMoreThanOneProductMatches() {
        server.expect(requestTo(ELASTICACHE)).andRespond(withSuccess(file(
                List.of(REDIS, product("OTHERSKU00000000", "Redis", "NodeUsage:cache.t4g.small")),
                List.of(term("BYFG57CPZSFUXSSY", "Hrs", "0.0320000000"), term("OTHERSKU00000000", "Hrs", "0.0500000000")),
                List.of()), MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> adapter.quote(AWS, "redis")).isInstanceOf(PricingUnavailableException.class);
    }

    @Test
    void rejectsAPriceInAnotherUnitOrWithoutAnOnDemandTerm() {
        server.expect(requestTo(ELASTICACHE)).andRespond(withSuccess(file(
                List.of(REDIS), List.of(term("BYFG57CPZSFUXSSY", "GB-Mo", "0.0320000000")), List.of()), MediaType.APPLICATION_JSON));
        assertThatThrownBy(() -> adapter.quote(AWS, "redis")).isInstanceOf(PricingUnavailableException.class);

        server.reset();
        server.expect(requestTo(ELASTICACHE)).andRespond(withSuccess(file(
                List.of(REDIS), List.of(), List.of(term("BYFG57CPZSFUXSSY", "Hrs", "0.0200000000"))), MediaType.APPLICATION_JSON));
        assertThatThrownBy(() -> adapter.quote(AWS, "redis")).isInstanceOf(PricingUnavailableException.class);

        server.reset();
        server.expect(requestTo(ELASTICACHE)).andRespond(withSuccess(file(
                List.of(REDIS), List.of(term("BYFG57CPZSFUXSSY", "Hrs", "0.0000000000")), List.of()), MediaType.APPLICATION_JSON));
        assertThatThrownBy(() -> adapter.quote(AWS, "redis")).isInstanceOf(PricingUnavailableException.class);
    }

    @Test
    void doesNotReadAFileOverTheSizeLimit() {
        String body = file(List.of(REDIS), List.of(term("BYFG57CPZSFUXSSY", "Hrs", "0.0320000000")), List.of());
        adapter = adapter(body.length() - 10L);
        server.expect(requestTo(ELASTICACHE)).andRespond(withSuccess(body, MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> adapter.quote(AWS, "redis")).isInstanceOf(PricingUnavailableException.class);
    }

    @Test
    void aProviderErrorOrABrokenFileIsUnavailableNotAPrice() {
        server.expect(requestTo(ELASTICACHE)).andRespond(withStatus(HttpStatus.NOT_FOUND));
        assertThatThrownBy(() -> adapter.quote(AWS, "redis")).isInstanceOf(PricingUnavailableException.class);

        server.reset();
        server.expect(requestTo(ELASTICACHE)).andRespond(withSuccess("{\"products\":{\"A\":{", MediaType.APPLICATION_JSON));
        assertThatThrownBy(() -> adapter.quote(AWS, "redis")).isInstanceOf(PricingUnavailableException.class);
    }
}
