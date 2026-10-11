package dev.portfolio.infrastructure.config;

import dev.portfolio.application.port.in.PricingUseCase;
import dev.portfolio.application.port.out.CachePort;
import dev.portfolio.application.port.out.PricingProviderPort;
import dev.portfolio.application.port.out.RateLimiterPort;
import dev.portfolio.application.port.out.TelemetryPort;
import dev.portfolio.application.service.CachedPricingServiceDecorator;
import dev.portfolio.application.service.PricingProviderRouter;
import dev.portfolio.application.service.PricingService;
import dev.portfolio.infrastructure.adapter.out.pricing.AwsPriceListAdapter;
import dev.portfolio.infrastructure.adapter.out.pricing.AzureRetailPricesAdapter;
import dev.portfolio.infrastructure.adapter.out.pricing.GcpPricingApiAdapter;
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
import java.time.Duration;
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
    public static final String AWS_PRICING_CIRCUIT_BREAKER = "awsPricing";
    public static final String GCP_PRICING_CIRCUIT_BREAKER = "gcpPricing";

    @Bean
    public PricingUseCase pricingUseCase(RestClient.Builder builder, PricingProperties properties, CachePort cache,
                                         TelemetryPort telemetry, RateLimiterPort rateLimiter, RateLimitProperties rateLimits) {
        List<PricingProviderPort> providers = new ArrayList<>();
        if (properties.azure().enabled()) {
            providers.add(azure(builder, properties.azure(), telemetry));
        }
        if (properties.aws().enabled()) {
            providers.add(aws(builder, properties.aws(), telemetry));
        }
        // Google Cloud exige clave y sus SKU se asignan por configuración: sin las dos cosas no hay nada que consultar.
        if (!properties.gcp().apiKey().isBlank() && !properties.gcp().skus().isEmpty()) {
            providers.add(gcp(builder, properties.gcp(), telemetry));
        }
        providers.add(new UnmappedServiceAdapter(telemetry));
        PricingProviderPort cached = new CachedPricingServiceDecorator(
                new PricingProviderRouter(providers), cache, telemetry, properties.cacheTtl(), properties.lastKnownTtl());
        return new PricingService(cached, rateLimiter, rateLimits.pricing().toPolicy());
    }

    private static AzureRetailPricesAdapter azure(RestClient.Builder builder, PricingProperties.Azure azure, TelemetryPort telemetry) {
        RestClient restClient = restClient(builder, azure.baseUrl(), azure.connectTimeout(), azure.readTimeout());
        return new AzureRetailPricesAdapter(restClient, azure.region(),
                circuitBreaker(AZURE_PRICING_CIRCUIT_BREAKER, azure.circuitBreaker()), telemetry, Clock.systemUTC());
    }

    private static AwsPriceListAdapter aws(RestClient.Builder builder, PricingProperties.Aws aws, TelemetryPort telemetry) {
        RestClient restClient = restClient(builder, aws.baseUrl(), aws.connectTimeout(), aws.readTimeout());
        return new AwsPriceListAdapter(restClient, aws.maxBytes().toBytes(),
                circuitBreaker(AWS_PRICING_CIRCUIT_BREAKER, aws.circuitBreaker()), telemetry, Clock.systemUTC());
    }

    private static GcpPricingApiAdapter gcp(RestClient.Builder builder, PricingProperties.Gcp gcp, TelemetryPort telemetry) {
        RestClient restClient = restClient(builder, gcp.baseUrl(), gcp.connectTimeout(), gcp.readTimeout());
        return new GcpPricingApiAdapter(restClient, gcp.apiKey(), gcp.skus(), gcp.region(),
                circuitBreaker(GCP_PRICING_CIRCUIT_BREAKER, gcp.circuitBreaker()), telemetry, Clock.systemUTC());
    }

    private static RestClient restClient(RestClient.Builder builder, String baseUrl, Duration connectTimeout, Duration readTimeout) {
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(
                HttpClient.newBuilder().connectTimeout(connectTimeout).build());
        factory.setReadTimeout(readTimeout);
        return builder.clone().requestFactory(factory).baseUrl(baseUrl).build();
    }

    // Cualquier fallo del proveedor cuenta: la petición la arma el servidor, así que un 4xx no es un
    // error que se arregle reintentando otra petición.
    private static CircuitBreaker circuitBreaker(String name, PricingProperties.CircuitBreaker settings) {
        CircuitBreaker circuitBreaker = CircuitBreaker.of(name, CircuitBreakerConfig.custom()
                .failureRateThreshold(settings.failureRateThreshold())
                .slidingWindowType(CircuitBreakerConfig.SlidingWindowType.COUNT_BASED)
                .slidingWindowSize(settings.slidingWindowSize())
                .minimumNumberOfCalls(settings.minimumCalls())
                .waitDurationInOpenState(settings.openDuration())
                .permittedNumberOfCallsInHalfOpenState(settings.halfOpenCalls())
                .build());
        circuitBreaker.getEventPublisher().onStateTransition(event ->
                log.warn("Circuit breaker {}: {}", name, event.getStateTransition()));
        return circuitBreaker;
    }
}
