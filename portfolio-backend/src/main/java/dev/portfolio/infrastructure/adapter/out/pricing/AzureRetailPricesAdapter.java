package dev.portfolio.infrastructure.adapter.out.pricing;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
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
import dev.portfolio.infrastructure.adapter.out.pricing.AzureSkuCatalog.AzureSku;
import io.github.resilience4j.circuitbreaker.CallNotPermittedException;
import io.github.resilience4j.circuitbreaker.CircuitBreaker;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.math.BigDecimal;
import java.time.Clock;
import java.util.List;

/**
 * Precios de lista de Azure, leídos de su API pública de precios al por menor (sin clave).
 * La petición filtra por un medidor concreto de {@link AzureSkuCatalog}; de la respuesta solo se
 * acepta la fila que coincide exactamente y en la unidad esperada. Las llamadas pasan por un
 * circuit breaker: con el proveedor caído o limitando peticiones se deja de insistir, y el fallo
 * sale como {@link PricingUnavailableException} para que quien llama sirva la última tarifa.
 */
@Slf4j
public class AzureRetailPricesAdapter implements PricingProviderPort {

    static final String SOURCE = "Azure Retail Prices API";
    private static final String CONSUMPTION = "Consumption";

    private final RestClient restClient;
    private final String region;
    private final CircuitBreaker circuitBreaker;
    private final TelemetryPort telemetry;
    private final Clock clock;

    public AzureRetailPricesAdapter(RestClient restClient, String region, CircuitBreaker circuitBreaker, TelemetryPort telemetry, Clock clock) {
        this.restClient = restClient;
        this.region = region;
        this.circuitBreaker = circuitBreaker;
        this.telemetry = telemetry;
        this.clock = clock;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record RetailPrices(@JsonProperty("Items") List<Item> items) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record Item(String currencyCode, BigDecimal retailPrice, String armRegionName, String productName, String skuName,
                String serviceName, String meterName, String unitOfMeasure, String type) {
    }

    @Override
    public boolean supports(CloudProviderDomain provider, String serviceCode) {
        return provider == CloudProviderDomain.AZURE && AzureSkuCatalog.find(serviceCode).isPresent();
    }

    @Override
    public PriceQuote quote(CloudProviderDomain provider, String serviceCode) {
        AzureSku sku = AzureSkuCatalog.find(serviceCode).filter(found -> provider == CloudProviderDomain.AZURE)
                .orElseThrow(() -> new IllegalArgumentException("Servicio sin SKU de Azure: " + serviceCode));
        telemetry.publish(TelemetryEventType.PRICING_REQUEST, "Dispatching GET to Azure Retail API for SKU '%s'...".formatted(sku.sku()));

        RetailPrices response;
        try {
            response = circuitBreaker.executeSupplier(() -> fetch(sku));
        } catch (CallNotPermittedException e) {
            throw new PricingUnavailableException("El circuito de la API de precios de Azure está abierto", e);
        } catch (RestClientException e) {
            log.warn("Azure Retail Prices API no disponible para {}: {}", sku.sku(), e.getMessage());
            throw new PricingUnavailableException("La API de precios de Azure no responde", e);
        }

        Item item = response == null || response.items() == null ? null : response.items().stream()
                .filter(candidate -> matches(candidate, sku)).findFirst().orElse(null);
        if (item == null) {
            log.warn("Azure Retail Prices API no devolvió el medidor esperado para {} ({} / {} / {})",
                    sku.sku(), sku.productName(), sku.skuName(), sku.meterName());
            throw new PricingUnavailableException("La API de precios de Azure no devolvió el medidor de " + sku.sku());
        }
        try {
            SkuPricing pricing = new SkuPricing(sku.sku(), item.productName() + " · " + item.meterName(),
                    new Money(item.retailPrice(), Currency.of(item.currencyCode())), sku.unit(), region, SOURCE, clock.instant());
            return PriceQuote.priced(serviceCode, provider, PricingStatus.LIVE, pricing, sku.note());
        } catch (IllegalArgumentException e) {
            throw new PricingUnavailableException("La API de precios de Azure devolvió un precio no válido para " + sku.sku(), e);
        }
    }

    private RetailPrices fetch(AzureSku sku) {
        // Los valores del filtro salen de la tabla de SKU, nunca de la petición del cliente.
        String filter = "serviceName eq '%s' and armRegionName eq '%s' and priceType eq '%s' and productName eq '%s' and skuName eq '%s' and meterName eq '%s'"
                .formatted(sku.serviceName(), region, CONSUMPTION, sku.productName(), sku.skuName(), sku.meterName());
        return restClient.get()
                .uri(builder -> builder.queryParam("$filter", "{filter}").build(filter))
                .retrieve()
                .body(RetailPrices.class);
    }

    /** La fila que se pidió y ninguna otra: mismo medidor, en la región, de pago por uso y en la unidad esperada. */
    private boolean matches(Item item, AzureSku sku) {
        return CONSUMPTION.equals(item.type())
                && sku.serviceName().equals(item.serviceName())
                && sku.productName().equals(item.productName())
                && sku.skuName().equals(item.skuName())
                && sku.meterName().equals(item.meterName())
                && sku.unitOfMeasure().equals(item.unitOfMeasure())
                && region.equals(item.armRegionName())
                && item.retailPrice() != null && item.retailPrice().signum() > 0
                && item.currencyCode() != null;
    }
}
