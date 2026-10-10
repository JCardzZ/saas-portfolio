package dev.portfolio.infrastructure.adapter.out.pricing;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

import org.springframework.util.unit.DataSize;

import java.time.Duration;
import java.util.Map;

/**
 * @param cacheTtl     tiempo durante el que una tarifa leída del proveedor se sirve sin volver a preguntarle
 * @param lastKnownTtl tiempo que se conserva la última tarifa conocida, para servirla si el proveedor no responde
 */
@ConfigurationProperties(prefix = "pricing")
public record PricingProperties(
        @DefaultValue("24h") Duration cacheTtl,
        @DefaultValue("30d") Duration lastKnownTtl,
        @DefaultValue Azure azure,
        @DefaultValue Aws aws,
        @DefaultValue Gcp gcp
) {
    /**
     * @param baseUrl dirección de la API pública de precios de Azure; no lleva clave
     * @param region  región de Azure cuyas tarifas se consultan
     */
    public record Azure(
            @DefaultValue("true") boolean enabled,
            @DefaultValue("https://prices.azure.com/api/retail/prices") String baseUrl,
            @DefaultValue("eastus") String region,
            @DefaultValue("3s") Duration connectTimeout,
            @DefaultValue("6s") Duration readTimeout,
            @DefaultValue CircuitBreaker circuitBreaker
    ) {
    }

    /**
     * @param baseUrl  origen de los ficheros públicos de precios de AWS; no llevan clave
     * @param maxBytes tamaño máximo de fichero que se acepta leer
     */
    public record Aws(
            @DefaultValue("true") boolean enabled,
            @DefaultValue("https://pricing.us-east-1.amazonaws.com") String baseUrl,
            @DefaultValue("3s") Duration connectTimeout,
            @DefaultValue("20s") Duration readTimeout,
            @DefaultValue("48MB") DataSize maxBytes,
            @DefaultValue CircuitBreaker circuitBreaker
    ) {
    }

    /**
     * @param apiKey clave de API de Google Cloud; sin ella no se consulta nada
     * @param region región que se rotula en las tarifas (cada SKU de Google Cloud ya es de una región)
     * @param skus   SKU que representa a cada servicio del catálogo, por su código
     */
    public record Gcp(
            @DefaultValue("") String apiKey,
            @DefaultValue("https://cloudbilling.googleapis.com") String baseUrl,
            @DefaultValue("us-east1") String region,
            @DefaultValue("3s") Duration connectTimeout,
            @DefaultValue("6s") Duration readTimeout,
            Map<String, GcpPricingApiAdapter.GcpSku> skus,
            @DefaultValue CircuitBreaker circuitBreaker
    ) {
        public Gcp {
            skus = skus == null ? Map.of() : skus;
        }
    }

    /** Mismo significado que en el circuito del motor de IA. */
    public record CircuitBreaker(
            @DefaultValue("50") float failureRateThreshold,
            @DefaultValue("10") int slidingWindowSize,
            @DefaultValue("4") int minimumCalls,
            @DefaultValue("60s") Duration openDuration,
            @DefaultValue("2") int halfOpenCalls
    ) {
    }
}
