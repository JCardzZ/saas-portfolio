package dev.portfolio.infrastructure.config;

import dev.portfolio.application.port.in.PricingUseCase;
import dev.portfolio.application.port.out.CachePort;
import dev.portfolio.application.port.out.PricingProviderPort;
import dev.portfolio.application.port.out.RateLimiterPort;
import dev.portfolio.application.port.out.TelemetryPort;
import dev.portfolio.application.service.CachedPricingServiceDecorator;
import dev.portfolio.application.service.PricingProviderRouter;
import dev.portfolio.application.service.PricingService;
import dev.portfolio.infrastructure.adapter.out.pricing.AzureRetailPricesAdapter;
import dev.portfolio.infrastructure.adapter.out.pricing.PricingProperties;
import dev.portfolio.infrastructure.adapter.out.pricing.UnmappedServiceAdapter;
import io.github.resilience4j.circuitbreaker.CircuitBreaker;
import io.github.resilience4j.circuitbreaker.CircuitBreakerConfig;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

import java.net.http.HttpClient;
import java.time.Clock;
import java.util.ArrayList;
import java.util.List;

/**
 * Motor de precios: las fuentes por nube, en orden, con lo que no tiene precio al final; y
 * delante de todas, la caché. Añadir una nube es añadir su adaptador a la lista.
 */
@Slf4j
@Configuration
@EnableConfigurationProperties(PricingProperties.class)
public class PricingConfig {

    public static final String AZURE_PRICING_CIRCUIT_BREAKER = "azurePricing";

    @Bean
    public PricingUseCase pricingUseCase(RestClient.Builder builder, PricingProperties properties, CachePort cache,
                                         TelemetryPort telemetry, RateLimiterPort rateLimiter, RateLimitProperties rateLimits) {
        List<PricingProviderPort> providers = new ArrayList<>();
        if (properties.azure().enabled()) {
            providers.add(azure(builder, properties.azure(), telemetry));
        }
        providers.add(new UnmappedServiceAdapter(telemetry));
        PricingProviderPort cached = new CachedPricingServiceDecorator(
                new PricingProviderRouter(providers), cache, telemetry, properties.cacheTtl(), properties.lastKnownTtl());
        return new PricingService(cached, rateLimiter, rateLimits.pricing().toPolicy());
    }

    private static AzureRetailPricesAdapter azure(RestClient.Builder builder, PricingProperties.Azure azure, TelemetryPort telemetry) {
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(
                HttpClient.newBuilder().connectTimeout(azure.connectTimeout()).build());
        factory.setReadTimeout(azure.readTimeout());
        RestClient restClient = builder.clone().requestFactory(factory).baseUrl(azure.baseUrl()).build();
        return new AzureRetailPricesAdapter(restClient, azure.region(), circuitBreaker(azure.circuitBreaker()), telemetry, Clock.systemUTC());
    }

    // Cualquier fallo de la API cuenta: no lleva clave ni cuerpo, así que un 4xx no es un error nuestro
    // que se arregle reintentando otra petición.
    private static CircuitBreaker circuitBreaker(PricingProperties.CircuitBreaker settings) {
        CircuitBreaker circuitBreaker = CircuitBreaker.of(AZURE_PRICING_CIRCUIT_BREAKER, CircuitBreakerConfig.custom()
                .failureRateThreshold(settings.failureRateThreshold())
                .slidingWindowType(CircuitBreakerConfig.SlidingWindowType.COUNT_BASED)
                .slidingWindowSize(settings.slidingWindowSize())
                .minimumNumberOfCalls(settings.minimumCalls())
                .waitDurationInOpenState(settings.openDuration())
                .permittedNumberOfCallsInHalfOpenState(settings.halfOpenCalls())
                .build());
        circuitBreaker.getEventPublisher().onStateTransition(event ->
                log.warn("Azure pricing circuit breaker: {}", event.getStateTransition()));
        return circuitBreaker;
    }
}
