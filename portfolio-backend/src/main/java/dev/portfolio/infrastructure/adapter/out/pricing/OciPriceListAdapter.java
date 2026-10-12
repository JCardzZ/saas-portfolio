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
import dev.portfolio.domain.model.pricing.SkuPricing;
import dev.portfolio.infrastructure.adapter.out.pricing.OciSkuCatalog.OciSku;
import io.github.resilience4j.circuitbreaker.CallNotPermittedException;
import io.github.resilience4j.circuitbreaker.CircuitBreaker;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.math.BigDecimal;
import java.time.Clock;
import java.util.List;

/**
 * Precios de lista de Oracle Cloud, leídos de su lista pública de precios (sin clave). Se pide
 * un número de parte de {@link OciSkuCatalog}; de la respuesta solo se acepta el producto que
 * coincide exactamente, en la unidad esperada, en la moneda pedida y con un único precio de pago
 * por uso. Las llamadas pasan por un circuit breaker, y el fallo sale como
 * {@link PricingUnavailableException} para que quien llama sirva la última tarifa.
 */
@Slf4j
public class OciPriceListAdapter implements PricingProviderPort {

    static final String SOURCE = "Oracle Cloud Price List API";
    /** La lista no distingue regiones: es la tarifa del catálogo público. */
    static final String REGION = "lista pública";
    private static final String PAY_AS_YOU_GO = "PAY_AS_YOU_GO";
    private static final String CURRENCY = "USD";

    private final RestClient restClient;
    private final CircuitBreaker circuitBreaker;
    private final TelemetryPort telemetry;
    private final Clock clock;

    public OciPriceListAdapter(RestClient restClient, CircuitBreaker circuitBreaker, TelemetryPort telemetry, Clock clock) {
        this.restClient = restClient;
        this.circuitBreaker = circuitBreaker;
        this.telemetry = telemetry;
        this.clock = clock;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record PriceList(List<Product> items) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record Product(String partNumber, String displayName, String metricName, List<Localization> currencyCodeLocalizations) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record Localization(String currencyCode, List<Price> prices) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record Price(String model, BigDecimal value) {
    }

    @Override
    public boolean supports(CloudProviderDomain provider, String serviceCode) {
        return provider == CloudProviderDomain.OCI && OciSkuCatalog.find(serviceCode).isPresent();
    }

    @Override
    public PriceQuote quote(CloudProviderDomain provider, String serviceCode) {
        OciSku sku = OciSkuCatalog.find(serviceCode).filter(found -> provider == CloudProviderDomain.OCI)
                .orElseThrow(() -> new IllegalArgumentException("Servicio sin SKU de Oracle Cloud: " + serviceCode));
        telemetry.publish(TelemetryEventType.PRICING_REQUEST, "Dispatching GET to Oracle Cloud Price List for part '%s'...".formatted(sku.partNumber()));

        PriceList response;
        try {
            response = circuitBreaker.executeSupplier(() -> fetch(sku));
        } catch (CallNotPermittedException e) {
            throw new PricingUnavailableException("El circuito de la lista de precios de Oracle Cloud está abierto", e);
        } catch (RestClientException e) {
            log.warn("Oracle Cloud Price List no disponible para {}: {}", sku.partNumber(), e.getMessage());
            throw new PricingUnavailableException("La lista de precios de Oracle Cloud no responde", e);
        }

        BigDecimal price = response == null || response.items() == null ? null : response.items().stream()
                .filter(product -> matches(product, sku)).findFirst().map(OciPriceListAdapter::payAsYouGo).orElse(null);
        if (price == null) {
            log.warn("Oracle Cloud Price List no devolvió el producto esperado para {} ({} / {})", sku.partNumber(), sku.displayName(), sku.metricName());
            throw new PricingUnavailableException("La lista de precios de Oracle Cloud no devolvió el producto de " + sku.sku());
        }
        try {
            SkuPricing pricing = new SkuPricing(sku.sku(), sku.displayName() + " · " + sku.metricName(),
                    new Money(price, Currency.of(CURRENCY)), sku.unit(), REGION, SOURCE, clock.instant());
            return PriceQuote.priced(serviceCode, provider, PricingStatus.LIVE, pricing, sku.note());
        } catch (IllegalArgumentException e) {
            throw new PricingUnavailableException("La lista de precios de Oracle Cloud devolvió un precio no válido para " + sku.sku(), e);
        }
    }

    private PriceList fetch(OciSku sku) {
        // El número de parte sale de la tabla de SKU, nunca de la petición del cliente.
        return restClient.get()
                .uri(builder -> builder.queryParam("partNumber", sku.partNumber()).queryParam("currencyCode", CURRENCY).build())
                .retrieve()
                .body(PriceList.class);
    }

    /** El producto que se pidió y ningún otro: mismo número de parte, mismo nombre y la unidad esperada. */
    private static boolean matches(Product product, OciSku sku) {
        return sku.partNumber().equals(product.partNumber())
                && sku.displayName().equals(product.displayName())
                && sku.metricName().equals(product.metricName());
    }

    /**
     * El precio de pago por uso en la moneda pedida, solo si es único y positivo. Un producto con
     * tramos (el primero gratuito, por ejemplo) no tiene «un» precio: se rechaza en vez de elegir uno.
     */
    private static BigDecimal payAsYouGo(Product product) {
        if (product.currencyCodeLocalizations() == null) {
            return null;
        }
        List<Price> prices = product.currencyCodeLocalizations().stream()
                .filter(localization -> CURRENCY.equals(localization.currencyCode()) && localization.prices() != null)
                .flatMap(localization -> localization.prices().stream())
                .filter(price -> PAY_AS_YOU_GO.equals(price.model()))
                .toList();
        return prices.size() == 1 && prices.get(0).value() != null && prices.get(0).value().signum() > 0 ? prices.get(0).value() : null;
    }
}
