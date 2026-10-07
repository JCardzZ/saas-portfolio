package dev.portfolio.infrastructure.config;

import dev.portfolio.infrastructure.adapter.out.ai.GeminiProperties;
import dev.portfolio.infrastructure.adapter.out.career.CareerProperties;
import dev.portfolio.infrastructure.adapter.out.source.CodeSourceProperties;
import io.github.resilience4j.circuitbreaker.CircuitBreaker;
import io.github.resilience4j.circuitbreaker.CircuitBreakerConfig;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestClientResponseException;

@Slf4j
@Configuration
@EnableConfigurationProperties({GeminiProperties.class, CodeSourceProperties.class, CareerProperties.class})
public class AiConfig {

    public static final String AI_ENGINE_CIRCUIT_BREAKER = "aiEngine";

    @Bean
    public CircuitBreaker aiEngineCircuitBreaker(GeminiProperties properties) {
        GeminiProperties.CircuitBreaker settings = properties.circuitBreaker();
        CircuitBreaker circuitBreaker = CircuitBreaker.of(AI_ENGINE_CIRCUIT_BREAKER, CircuitBreakerConfig.custom()
                .failureRateThreshold(settings.failureRateThreshold())
                .slidingWindowType(CircuitBreakerConfig.SlidingWindowType.COUNT_BASED)
                .slidingWindowSize(settings.slidingWindowSize())
                .minimumNumberOfCalls(settings.minimumCalls())
                .waitDurationInOpenState(settings.openDuration())
                .permittedNumberOfCallsInHalfOpenState(settings.halfOpenCalls())
                .recordException(AiConfig::isProviderFailure)
                .build());
        circuitBreaker.getEventPublisher().onStateTransition(event ->
                log.warn("AI engine circuit breaker: {}", event.getStateTransition()));
        return circuitBreaker;
    }

    // Solo cuentan los fallos del proveedor (5xx, 429, red o timeout). Un 4xx es culpa de
    // nuestra petición: abrir el circuito por él dejaría sin servicio a las peticiones válidas.
    static boolean isProviderFailure(Throwable throwable) {
        if (throwable instanceof RestClientResponseException response) {
            int status = response.getStatusCode().value();
            return status >= 500 || status == 429;
        }
        return true;
    }
}
