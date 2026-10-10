package dev.portfolio.infrastructure.adapter.out.pricing;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

import java.time.Duration;

/**
 * @param cacheTtl     tiempo durante el que una tarifa leída del proveedor se sirve sin volver a preguntarle
 * @param lastKnownTtl tiempo que se conserva la última tarifa conocida, para servirla si el proveedor no responde
 */
@ConfigurationProperties(prefix = "pricing")
public record PricingProperties(
        @DefaultValue("24h") Duration cacheTtl,
        @DefaultValue("30d") Duration lastKnownTtl,
        @DefaultValue Azure azure
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
