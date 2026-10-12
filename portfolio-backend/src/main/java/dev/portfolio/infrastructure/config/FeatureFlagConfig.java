package dev.portfolio.infrastructure.config;

import dev.openfeature.sdk.OpenFeatureAPI;
import dev.portfolio.application.port.in.FeatureFlagUseCase;
import dev.portfolio.application.port.out.CachePort;
import dev.portfolio.application.port.out.FeatureFlagRepositoryPort;
import dev.portfolio.application.port.out.FeatureFlags;
import dev.portfolio.application.service.FeatureFlagService;
import dev.portfolio.infrastructure.adapter.out.flags.OpenFeatureFlagsAdapter;
import dev.portfolio.infrastructure.adapter.out.flags.PortfolioFeatureProvider;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Clock;

@Configuration
public class FeatureFlagConfig {

    /** Dominio de OpenFeature de esta aplicación: el API del SDK es global al proceso. */
    static final String DOMAIN = "portfolio";

    @Bean
    public FeatureFlagUseCase featureFlagUseCase(FeatureFlagRepositoryPort repository, CachePort cache) {
        return new FeatureFlagService(repository, cache, Clock.systemUTC());
    }

    /**
     * El proveedor no lee nada al registrarse, así que arrancar no depende de la base de datos
     * ni de Redis: la primera lectura ocurre con la primera pregunta.
     */
    @Bean
    public FeatureFlags featureFlags(FeatureFlagUseCase flags) {
        OpenFeatureAPI api = OpenFeatureAPI.getInstance();
        api.setProviderAndWait(DOMAIN, new PortfolioFeatureProvider(flags));
        return new OpenFeatureFlagsAdapter(api.getClient(DOMAIN));
    }
}
