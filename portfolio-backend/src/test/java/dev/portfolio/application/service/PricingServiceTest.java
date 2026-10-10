package dev.portfolio.application.service;

import dev.portfolio.application.port.out.CachePort;
import dev.portfolio.application.port.out.PricingProviderPort;
import dev.portfolio.application.port.out.TelemetryPort;
import dev.portfolio.application.service.CachedPricingServiceDecorator.CachedPrice;
import dev.portfolio.domain.exception.InvalidRequestException;
import dev.portfolio.domain.exception.PricingUnavailableException;
import dev.portfolio.domain.exception.RateLimitExceededException;
import dev.portfolio.domain.model.CloudProviderDomain;
import dev.portfolio.domain.model.RateLimitDecision;
import dev.portfolio.domain.model.RateLimitPolicy;
import dev.portfolio.domain.model.TelemetryEventType;
import dev.portfolio.domain.model.pricing.Money;
import dev.portfolio.domain.model.pricing.PriceQuote;
import dev.portfolio.domain.model.pricing.PricingStatus;
import dev.portfolio.domain.model.pricing.PricingUnit;
import dev.portfolio.domain.model.pricing.SkuPricing;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static dev.portfolio.domain.model.CloudProviderDomain.AWS;
import static dev.portfolio.domain.model.CloudProviderDomain.AZURE;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PricingServiceTest {

    private static final Instant NOW = Instant.parse("2026-10-10T12:00:00Z");
    private static final Duration TTL = Duration.ofHours(24);
    private static final Duration LAST_KNOWN_TTL = Duration.ofDays(30);

    /** Caché en memoria que recuerda con qué vida se guardó cada clave y deja caducar a mano. */
    static final class InMemoryCache implements CachePort {
        final Map<String, Object> values = new HashMap<>();
        final Map<String, Duration> ttls = new HashMap<>();

        @Override
        @SuppressWarnings("unchecked")
        public <T> Optional<List<T>> getList(String key, Class<T> elementType) {
            return Optional.ofNullable((List<T>) values.get(key));
        }

        @Override
        public void put(String key, Object value, Duration ttl) {
            values.put(key, value);
            ttls.put(key, ttl);
        }

        @Override
        public void evict(String... keys) {
            for (String key : keys) {
                values.remove(key);
            }
        }
    }

    static final class RecordingTelemetry implements TelemetryPort {
        final List<String> events = new ArrayList<>();

        @Override
        public void publish(TelemetryEventType type, String details, String traceId) {
            events.add(type + " " + details);
        }
    }

    /** Fuente de precios de Azure de mentira: cuenta las llamadas y puede caerse. */
    static final class FakeAzure implements PricingProviderPort {
        int calls;
        boolean down;
        String price = "0.096";

        @Override
        public boolean supports(CloudProviderDomain provider, String serviceCode) {
            return provider == AZURE && serviceCode.equals("vm");
        }

        @Override
        public PriceQuote quote(CloudProviderDomain provider, String serviceCode) {
            calls++;
            if (down) {
                throw new PricingUnavailableException("timeout");
            }
            SkuPricing pricing = new SkuPricing("D2s_v5", "Virtual Machines Dsv5 Series · D2s v5", Money.usd(price), PricingUnit.HOURLY, "eastus", "Azure Retail Prices API", NOW);
            return PriceQuote.priced(serviceCode, provider, PricingStatus.LIVE, pricing, "Solo cómputo");
        }
    }

    static final class Everything implements PricingProviderPort {
        @Override
        public boolean supports(CloudProviderDomain provider, String serviceCode) {
            return true;
        }

        @Override
        public PriceQuote quote(CloudProviderDomain provider, String serviceCode) {
            return serviceCode.equals("snowflake")
                    ? PriceQuote.enterpriseLicense(serviceCode, provider, "oferta comercial")
                    : PriceQuote.unknown(serviceCode, provider, "sin tarifa");
        }
    }

    private final InMemoryCache cache = new InMemoryCache();
    private final RecordingTelemetry telemetry = new RecordingTelemetry();
    private final FakeAzure azure = new FakeAzure();
    private final PricingProviderPort cached = new CachedPricingServiceDecorator(
            new PricingProviderRouter(List.of(azure, new Everything())), cache, telemetry, TTL, LAST_KNOWN_TTL);
    private boolean allowed = true;
    private final PricingService service = new PricingService(cached,
            (key, policy) -> new RateLimitDecision(allowed, policy.maxRequests(), allowed ? 1 : 0, Duration.ofSeconds(30)),
            new RateLimitPolicy(30, Duration.ofMinutes(1)));

    @Test
    void readsFromTheProviderOnceAndServesTheCacheAfterwards() {
        PriceQuote first = cached.quote(AZURE, "vm");
        PriceQuote second = cached.quote(AZURE, "vm");

        assertThat(first.status()).isEqualTo(PricingStatus.LIVE);
        assertThat(second.status()).isEqualTo(PricingStatus.CACHED);
        assertThat(second.pricing()).isEqualTo(first.pricing());
        assertThat(second.note()).isEqualTo("Solo cómputo");
        assertThat(azure.calls).isEqualTo(1);
        assertThat(cache.ttls).containsEntry("portfolio:pricing:azure:vm", TTL).containsEntry("portfolio:pricing:azure:vm:last", LAST_KNOWN_TTL);
        assertThat(telemetry.events).containsExactly("PRICING_CACHED SKU 'D2s_v5' cached -> $0.0960 USD/hr");
    }

    @Test
    void whatIsCachedIsPlainDataThatSurvivesARoundTrip() {
        cached.quote(AZURE, "vm");

        assertThat(cache.values.get("portfolio:pricing:azure:vm")).isEqualTo(List.of(new CachedPrice("D2s_v5",
                "Virtual Machines Dsv5 Series · D2s v5", "0.096", "USD", "HOURLY", "eastus", "Azure Retail Prices API", NOW.toEpochMilli(), "Solo cómputo")));
    }

    @Test
    void servesTheLastKnownPriceWhenTheProviderIsDownAndTheCacheHasExpired() {
        cached.quote(AZURE, "vm");
        cache.evict("portfolio:pricing:azure:vm"); // pasan las 24 horas
        azure.down = true;
        telemetry.events.clear();

        PriceQuote stale = cached.quote(AZURE, "vm");

        assertThat(stale.status()).isEqualTo(PricingStatus.STALE);
        assertThat(stale.pricing().unitPrice()).isEqualTo(Money.usd("0.096"));
        assertThat(telemetry.events).containsExactly(
                "PRICING_FALLBACK Provider unavailable -> serving last known price for SKU 'D2s_v5' ($0.0960 USD/hr)");
        // La tarifa caducada no se vuelve a guardar como vigente: en cuanto el proveedor vuelva, se le pregunta.
        assertThat(cache.values).doesNotContainKey("portfolio:pricing:azure:vm");
    }

    @Test
    void withoutAnyPreviousPriceAFailureIsAnUnknownPriceNotAnError() {
        azure.down = true;

        PriceQuote quote = cached.quote(AZURE, "vm");

        assertThat(quote.status()).isEqualTo(PricingStatus.UNKNOWN_PRICING);
        assertThat(quote.price()).isEmpty();
        assertThat(telemetry.events).containsExactly("PRICING_FALLBACK Provider unavailable and no cached price for 'vm' -> UNKNOWN_PRICING");
        assertThat(cache.values).isEmpty();
    }

    @Test
    void refreshesThePriceOnceTheCacheExpires() {
        cached.quote(AZURE, "vm");
        cache.evict("portfolio:pricing:azure:vm");
        azure.price = "0.101";

        assertThat(cached.quote(AZURE, "vm").pricing().unitPrice()).isEqualTo(Money.usd("0.101"));
        assertThat(azure.calls).isEqualTo(2);
        assertThat(cached.quote(AZURE, "vm").status()).isEqualTo(PricingStatus.CACHED);
    }

    @Test
    void neverCachesAQuoteWithoutAPriceAndIgnoresABrokenCacheEntry() {
        assertThat(cached.quote(AZURE, "snowflake").status()).isEqualTo(PricingStatus.UNESTIMATED_ENTERPRISE_LICENSE);
        assertThat(cached.quote(AWS, "vm").status()).isEqualTo(PricingStatus.UNKNOWN_PRICING);
        assertThat(cache.values).isEmpty();

        cache.put("portfolio:pricing:azure:vm", List.of(new CachedPrice("D2s_v5", "", "no-es-un-número", "USD", "HOURLY", "", "", 0, "")), TTL);
        assertThat(cached.quote(AZURE, "vm").status()).isEqualTo(PricingStatus.LIVE);
    }

    @Test
    void theRouterAsksTheFirstSourceThatSupportsTheService() {
        PricingProviderRouter router = new PricingProviderRouter(List.of(azure, new Everything()));

        assertThat(router.quote(AZURE, "vm").status()).isEqualTo(PricingStatus.LIVE);
        assertThat(router.quote(AWS, "vm").status()).isEqualTo(PricingStatus.UNKNOWN_PRICING);
        assertThat(router.supports(AWS, "lo-que-sea")).isTrue();
        assertThat(new PricingProviderRouter(List.of(azure)).supports(AWS, "vm")).isFalse();
        assertThat(new PricingProviderRouter(List.of(azure)).quote(AWS, "vm").status()).isEqualTo(PricingStatus.UNKNOWN_PRICING);
    }

    @Test
    void quotesEachDistinctServiceOnceInTheOrderReceived() {
        List<PriceQuote> quotes = service.quote(AZURE, List.of("vm", "snowflake", "vm", "functions"), "203.0.113.7");

        assertThat(quotes).extracting(PriceQuote::serviceCode).containsExactly("vm", "snowflake", "functions");
        assertThat(quotes).extracting(PriceQuote::status)
                .containsExactly(PricingStatus.LIVE, PricingStatus.UNESTIMATED_ENTERPRISE_LICENSE, PricingStatus.UNKNOWN_PRICING);
        assertThat(azure.calls).isEqualTo(1);
    }

    @Test
    void aSourceThatFailsWithoutACacheInFrontStillGivesAQuote() {
        azure.down = true;
        PricingService bare = new PricingService(azure, (key, policy) -> new RateLimitDecision(true, 30, 29, Duration.ZERO),
                new RateLimitPolicy(30, Duration.ofMinutes(1)));

        assertThat(bare.quote(AZURE, List.of("vm"), "x")).extracting(PriceQuote::status).containsExactly(PricingStatus.UNKNOWN_PRICING);
    }

    @Test
    void rejectsWhatIsNotAListOfCatalogCodes() {
        assertThatThrownBy(() -> service.quote(null, List.of("vm"), "x")).isInstanceOf(InvalidRequestException.class);
        assertThatThrownBy(() -> service.quote(AZURE, null, "x")).isInstanceOf(InvalidRequestException.class);
        assertThatThrownBy(() -> service.quote(AZURE, List.of(), "x")).isInstanceOf(InvalidRequestException.class);
        assertThatThrownBy(() -> service.quote(AZURE, java.util.Collections.nCopies(61, "vm"), "x")).isInstanceOf(InvalidRequestException.class);
        // Ni un SKU, ni un filtro, ni una dirección: solo códigos del catálogo.
        for (String bad : List.of("Standard_D2s_v5' or 1 eq 1", "https://example.com", "a b", "")) {
            assertThatThrownBy(() -> service.quote(AZURE, List.of(bad), "x")).as(bad).isInstanceOf(InvalidRequestException.class);
        }
        assertThat(azure.calls).isZero();
    }

    @Test
    void limitsTheRequestsOfEachClientBeforeDoingAnything() {
        allowed = false;

        assertThatThrownBy(() -> service.quote(AZURE, List.of("vm"), "203.0.113.7")).isInstanceOf(RateLimitExceededException.class);
        assertThat(azure.calls).isZero();
    }
}
