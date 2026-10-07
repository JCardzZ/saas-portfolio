package dev.portfolio.infrastructure.adapter.out.ai;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

import java.time.Duration;

/**
 * @param apiKey         si está vacía la aplicación arranca, pero las llamadas de IA responden 503
 * @param embeddingModel cambiarlo invalida los embeddings guardados: los espacios vectoriales
 *                       de modelos distintos no son comparables y hay que reindexar
 */
@ConfigurationProperties(prefix = "ai.gemini")
public record GeminiProperties(
        String apiKey,
        @DefaultValue("https://generativelanguage.googleapis.com/v1beta") String baseUrl,
        @DefaultValue("gemini-embedding-2") String embeddingModel,
        @DefaultValue("gemini-3.5-flash-lite") String chatModel,
        @DefaultValue("5s") Duration connectTimeout,
        @DefaultValue("30s") Duration readTimeout,
        @DefaultValue CircuitBreaker circuitBreaker
) {

    /**
     * @param failureRateThreshold porcentaje de fallos, sobre las últimas {@code slidingWindowSize}
     *                             llamadas, a partir del cual se abre el circuito
     * @param minimumCalls         llamadas mínimas antes de evaluar el porcentaje
     * @param openDuration         tiempo que el circuito permanece abierto antes de probar de nuevo
     */
    public record CircuitBreaker(
            @DefaultValue("50") float failureRateThreshold,
            @DefaultValue("10") int slidingWindowSize,
            @DefaultValue("5") int minimumCalls,
            @DefaultValue("30s") Duration openDuration,
            @DefaultValue("2") int halfOpenCalls
    ) {
    }
}
