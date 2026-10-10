package dev.portfolio.application.service;

import dev.portfolio.application.port.out.CachePort;
import dev.portfolio.application.port.out.PricingProviderPort;
import dev.portfolio.application.port.out.TelemetryPort;
import dev.portfolio.domain.exception.PricingUnavailableException;
import dev.portfolio.domain.model.CloudProviderDomain;
import dev.portfolio.domain.model.TelemetryEventType;
import dev.portfolio.domain.model.pricing.Currency;
import dev.portfolio.domain.model.pricing.Money;
import dev.portfolio.domain.model.pricing.PriceQuote;
import dev.portfolio.domain.model.pricing.PricingStatus;
import dev.portfolio.domain.model.pricing.PricingUnit;
import dev.portfolio.domain.model.pricing.SkuPricing;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

/**
 * Pone una caché delante de una fuente de precios, sin que la fuente lo sepa. Una tarifa leída
 * del proveedor vale {@code ttl} (24 horas): mientras tanto no se le vuelve a preguntar. Se
 * guarda además como «última conocida», con una vida mucho más larga: si el proveedor deja de
 * responder, es lo que se sirve, marcado como {@code STALE}. Sin ninguna de las dos, el precio es
 * desconocido; nunca se inventa y nunca se propaga el fallo.
 */
public class CachedPricingServiceDecorator implements PricingProviderPort {

    private final PricingProviderPort delegate;
    private final CachePort cache;
    private final TelemetryPort telemetry;
    private final Duration ttl;
    private final Duration lastKnownTtl;

    public CachedPricingServiceDecorator(PricingProviderPort delegate, CachePort cache, TelemetryPort telemetry,
                                         Duration ttl, Duration lastKnownTtl) {
        this.delegate = delegate;
        this.cache = cache;
        this.telemetry = telemetry;
        this.ttl = ttl;
        this.lastKnownTtl = lastKnownTtl;
    }

    /** Forma en la que una tarifa se guarda en la caché: solo textos y números. */
    public record CachedPrice(String sku, String description, String amount, String currency, String unit,
                              String region, String source, long fetchedAtEpochMilli, String note) {

        static CachedPrice of(PriceQuote quote) {
            SkuPricing pricing = quote.pricing();
            return new CachedPrice(pricing.sku(), pricing.description(), pricing.unitPrice().amount().toPlainString(),
                    pricing.unitPrice().currency().code(), pricing.unit().name(), pricing.region(), pricing.source(),
                    pricing.fetchedAt().toEpochMilli(), quote.note());
        }

        PriceQuote toQuote(String serviceCode, CloudProviderDomain provider, PricingStatus status) {
            SkuPricing pricing = new SkuPricing(sku, description, Money.of(amount, Currency.of(currency)), PricingUnit.valueOf(unit),
                    region, source, Instant.ofEpochMilli(fetchedAtEpochMilli));
            return PriceQuote.priced(serviceCode, provider, status, pricing, note);
        }
    }

    @Override
    public boolean supports(CloudProviderDomain provider, String serviceCode) {
        return delegate.supports(provider, serviceCode);
    }

    @Override
    public PriceQuote quote(CloudProviderDomain provider, String serviceCode) {
        String key = CacheKeys.pricing(provider, serviceCode);
        Optional<PriceQuote> fresh = read(key, serviceCode, provider, PricingStatus.CACHED);
        if (fresh.isPresent()) {
            return fresh.get();
        }
        try {
            PriceQuote quote = delegate.quote(provider, serviceCode);
            if (quote.status() == PricingStatus.LIVE) {
                List<CachedPrice> value = List.of(CachedPrice.of(quote));
                cache.put(key, value, ttl);
                cache.put(CacheKeys.pricingLastKnown(provider, serviceCode), value, lastKnownTtl);
                telemetry.publish(TelemetryEventType.PRICING_CACHED,
                        "SKU '%s' cached -> %s".formatted(quote.pricing().sku(), quote.pricing().display()));
            }
            return quote;
        } catch (PricingUnavailableException e) {
            Optional<PriceQuote> lastKnown = read(CacheKeys.pricingLastKnown(provider, serviceCode), serviceCode, provider, PricingStatus.STALE);
            telemetry.publish(TelemetryEventType.PRICING_FALLBACK, lastKnown
                    .map(quote -> "Provider unavailable -> serving last known price for SKU '%s' (%s)"
                            .formatted(quote.pricing().sku(), quote.pricing().display()))
                    .orElse("Provider unavailable and no cached price for '%s' -> UNKNOWN_PRICING".formatted(serviceCode)));
            return lastKnown.orElseGet(() -> PriceQuote.unknown(serviceCode, provider,
                    "El proveedor de precios no responde y no hay una tarifa anterior guardada."));
        }
    }

    /** Una entrada de la caché que no se entiende (otra versión, datos rotos) cuenta como ausente. */
    private Optional<PriceQuote> read(String key, String serviceCode, CloudProviderDomain provider, PricingStatus status) {
        try {
            return cache.getList(key, CachedPrice.class)
                    .filter(entries -> !entries.isEmpty())
                    .map(entries -> entries.get(0).toQuote(serviceCode, provider, status));
        } catch (RuntimeException e) {
            return Optional.empty();
        }
    }
}
