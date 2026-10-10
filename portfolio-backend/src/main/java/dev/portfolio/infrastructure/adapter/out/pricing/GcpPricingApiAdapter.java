package dev.portfolio.infrastructure.adapter.out.pricing;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
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
import io.github.resilience4j.circuitbreaker.CallNotPermittedException;
import io.github.resilience4j.circuitbreaker.CircuitBreaker;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.math.BigDecimal;
import java.time.Clock;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * Precios de lista de Google Cloud, leídos de su Pricing API ({@code GET /v1beta/skus/{sku}/price}),
 * que exige una clave de API. Qué SKU representa a cada servicio lo decide la configuración del
 * servidor ({@code pricing.gcp.skus}), nunca la petición de un visitante; un servicio sin SKU
 * configurado no pasa por aquí. Solo se acepta una tarifa de un único tramo desde cero, en dólares
 * y por hora. La clave viaja en la dirección de la petición, así que aquí no se registra ni la
 * dirección ni el mensaje de los errores de transporte.
 */
@Slf4j
public class GcpPricingApiAdapter implements PricingProviderPort {

    static final String SOURCE = "Google Cloud Pricing API";
    private static final Pattern SKU_ID = Pattern.compile("^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$");
    private static final String USD = "USD";
    private static final String HOUR = "h";

    /**
     * @param skuId identificador del SKU en Google Cloud (p. ej. {@code 0012-B7F2-DD14})
     * @param label nombre corto que se muestra
     * @param note  qué cubre el precio
     */
    public record GcpSku(String skuId, String label, String note) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record Price(String currencyCode, String valueType, Rate rate) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record Rate(List<Tier> tiers, UnitInfo unitInfo) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record Tier(Amount startAmount, ListPrice listPrice) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record Amount(String value) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record ListPrice(String currencyCode, String units, Integer nanos) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record UnitInfo(String unit, String unitDescription, Amount unitQuantity) {
    }

    private final RestClient restClient;
    private final String apiKey;
    private final Map<String, GcpSku> skus;
    private final String region;
    private final CircuitBreaker circuitBreaker;
    private final TelemetryPort telemetry;
    private final Clock clock;

    public GcpPricingApiAdapter(RestClient restClient, String apiKey, Map<String, GcpSku> skus, String region,
                                CircuitBreaker circuitBreaker, TelemetryPort telemetry, Clock clock) {
        this.restClient = restClient;
        this.apiKey = apiKey;
        this.skus = wellFormed(skus);
        this.region = region;
        this.circuitBreaker = circuitBreaker;
        this.telemetry = telemetry;
        this.clock = clock;
    }

    private static Map<String, GcpSku> wellFormed(Map<String, GcpSku> configured) {
        Map<String, GcpSku> accepted = new HashMap<>();
        configured.forEach((service, sku) -> {
            if (sku != null && sku.skuId() != null && SKU_ID.matcher(sku.skuId()).matches()
                    && sku.label() != null && !sku.label().isBlank() && sku.note() != null && !sku.note().isBlank()) {
                accepted.put(service, sku);
            } else {
                log.warn("pricing.gcp.skus.{}: SKU mal formado o sin etiqueta o nota; se ignora", service);
            }
        });
        return Map.copyOf(accepted);
    }

    @Override
    public boolean supports(CloudProviderDomain provider, String serviceCode) {
        return provider == CloudProviderDomain.GCP && skus.containsKey(serviceCode);
    }

    @Override
    public PriceQuote quote(CloudProviderDomain provider, String serviceCode) {
        GcpSku sku = provider == CloudProviderDomain.GCP ? skus.get(serviceCode) : null;
        if (sku == null) {
            throw new IllegalArgumentException("Servicio sin SKU de Google Cloud: " + serviceCode);
        }
        telemetry.publish(TelemetryEventType.PRICING_REQUEST, "Dispatching GET to Google Cloud Pricing API for SKU '%s'...".formatted(sku.label()));

        Price price;
        try {
            price = circuitBreaker.executeSupplier(() -> fetch(sku));
        } catch (CallNotPermittedException e) {
            throw new PricingUnavailableException("El circuito de la API de precios de Google Cloud está abierto", e);
        } catch (RestClientException e) {
            log.warn("Google Cloud Pricing API no disponible para {} ({})", sku.label(), e.getClass().getSimpleName());
            throw new PricingUnavailableException("La API de precios de Google Cloud no responde");
        }

        ListPrice listPrice = onlyHourlyPrice(price, sku);
        try {
            BigDecimal amount = new BigDecimal(listPrice.units() == null ? "0" : listPrice.units())
                    .add(BigDecimal.valueOf(listPrice.nanos() == null ? 0 : listPrice.nanos(), 9));
            if (amount.signum() <= 0) {
                throw new IllegalArgumentException("precio no positivo");
            }
            SkuPricing pricing = new SkuPricing(sku.label(), "SKU " + sku.skuId(), new Money(amount, Currency.of(USD)),
                    PricingUnit.HOURLY, region, SOURCE, clock.instant());
            return PriceQuote.priced(serviceCode, provider, PricingStatus.LIVE, pricing, sku.note());
        } catch (IllegalArgumentException e) {
            throw new PricingUnavailableException("La API de precios de Google Cloud devolvió un precio no válido para " + sku.label());
        }
    }

    private Price fetch(GcpSku sku) {
        // El SKU sale de la configuración del servidor, nunca de la petición del cliente.
        return restClient.get()
                .uri("/v1beta/skus/{sku}/price?key={key}&currencyCode={currency}", sku.skuId(), apiKey, USD)
                .retrieve()
                .body(Price.class);
    }

    private static ListPrice onlyHourlyPrice(Price price, GcpSku sku) {
        if (price != null && "rate".equals(price.valueType()) && price.rate() != null
                && price.rate().tiers() != null && price.rate().tiers().size() == 1
                && price.rate().unitInfo() != null && HOUR.equals(price.rate().unitInfo().unit())
                && price.rate().unitInfo().unitQuantity() != null && "1".equals(price.rate().unitInfo().unitQuantity().value())) {
            Tier tier = price.rate().tiers().get(0);
            if (tier.startAmount() != null && "0".equals(tier.startAmount().value())
                    && tier.listPrice() != null && USD.equals(tier.listPrice().currencyCode())) {
                return tier.listPrice();
            }
        }
        log.warn("Google Cloud Pricing API no devolvió una tarifa por hora de un solo tramo para {} ({})", sku.label(), sku.skuId());
        throw new PricingUnavailableException("La API de precios de Google Cloud no devolvió una tarifa por hora para " + sku.label());
    }
}
