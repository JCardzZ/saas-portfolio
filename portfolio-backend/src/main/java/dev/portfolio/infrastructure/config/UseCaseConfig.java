package dev.portfolio.infrastructure.config;

import java.time.Clock;
import dev.portfolio.application.port.out.PasswordHasherPort;
import dev.portfolio.application.port.out.RefreshTokenRepositoryPort;
import dev.portfolio.application.port.out.UserRepositoryPort;
import dev.portfolio.application.service.UserAccessService;
import dev.portfolio.infrastructure.security.SessionProperties;
import dev.portfolio.application.port.in.McpAccessUseCase;
import dev.portfolio.application.service.McpAccessService;
import dev.portfolio.application.port.in.SystemDesignUseCase;
import dev.portfolio.application.service.SystemDesignService;
import dev.portfolio.domain.model.system.SystemDesignRules;
import java.io.UncheckedIOException;
import java.io.InputStream;
import java.io.IOException;
import org.springframework.core.io.ClassPathResource;
import dev.portfolio.domain.model.ArchitectureGraphRules;
import dev.portfolio.application.port.out.FeatureFlags;
import org.springframework.beans.factory.ObjectProvider;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.portfolio.application.port.in.ArchitectureCopilotUseCase;
import dev.portfolio.application.port.in.ArchitectureProjectUseCase;
import dev.portfolio.application.port.in.ArticleUseCase;
import dev.portfolio.application.port.in.TerraformUseCase;
import dev.portfolio.application.port.in.AuthUseCase;
import dev.portfolio.application.port.in.CareerUseCase;
import dev.portfolio.application.port.in.CloudCatalogUseCase;
import dev.portfolio.application.port.in.CvUseCase;
import dev.portfolio.application.port.in.ProfilePhotoUseCase;
import dev.portfolio.application.port.in.ProjectUseCase;
import dev.portfolio.application.port.in.RAGIndexingUseCase;
import dev.portfolio.application.port.in.RAGUseCase;
import dev.portfolio.application.port.in.SystemHealthUseCase;
import dev.portfolio.application.port.in.TechnologyUseCase;
import dev.portfolio.application.port.out.ArchitectureProjectRepositoryPort;
import dev.portfolio.application.port.out.ArticleRepositoryPort;
import dev.portfolio.application.port.out.CachePort;
import dev.portfolio.application.port.out.CareerStoryPort;
import dev.portfolio.application.port.out.ClientAuthenticatorPort;
import dev.portfolio.application.port.out.CloudCatalogRepositoryPort;
import dev.portfolio.application.port.out.CodeSourcePort;
import dev.portfolio.application.port.out.CvRendererPort;
import dev.portfolio.application.port.out.ProfilePhotoPort;
import dev.portfolio.application.port.out.GeminiAiPort;
import dev.portfolio.application.port.out.ProjectRepositoryPort;
import dev.portfolio.application.port.out.RateLimiterPort;
import dev.portfolio.application.port.out.SystemProbePort;
import dev.portfolio.application.port.out.TechnologyRepositoryPort;
import dev.portfolio.application.port.out.TelemetryPort;
import dev.portfolio.application.port.out.TokenIssuerPort;
import dev.portfolio.application.port.out.VectorRepositoryPort;
import dev.portfolio.application.service.ArchitectureCopilotService;
import dev.portfolio.application.service.ArchitectureProjectService;
import dev.portfolio.application.service.ArticleService;
import dev.portfolio.application.service.TerraformService;
import dev.portfolio.application.service.AuthService;
import dev.portfolio.application.service.CareerService;
import dev.portfolio.application.service.CloudCatalogService;
import dev.portfolio.application.service.CvService;
import dev.portfolio.application.service.ProfilePhotoService;
import dev.portfolio.application.service.ProjectService;
import dev.portfolio.application.service.RAGIndexingService;
import dev.portfolio.application.service.RAGService;
import dev.portfolio.application.service.SystemHealthService;
import dev.portfolio.application.service.TechnologyService;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties(RateLimitProperties.class)
public class UseCaseConfig {

    static final String GRAPH_RULES = "architecture/graph-rules.json";
    static final String SYSTEM_DESIGN = "architecture/system-design.json";

    @Bean
    public TechnologyUseCase technologyUseCase(TechnologyRepositoryPort repository, CachePort cache) {
        return new TechnologyService(repository, cache);
    }

    @Bean
    public ProjectUseCase projectUseCase(ProjectRepositoryPort repository, CachePort cache) {
        return new ProjectService(repository, cache);
    }

    @Bean
    public AuthUseCase authUseCase(ClientAuthenticatorPort clientAuthenticator,
                                   TokenIssuerPort tokenIssuer,
                                   RateLimiterPort rateLimiter,
                                   RateLimitProperties rateLimitProperties) {
        return new AuthService(
                clientAuthenticator, tokenIssuer, rateLimiter, rateLimitProperties.authToken().toPolicy());
    }

    /** Un solo servicio para las sesiones y para la gestión de cuentas: se inyecta por cualquiera de sus dos puertos. */
    @Bean
    public UserAccessService userAccessService(UserRepositoryPort users, RefreshTokenRepositoryPort refreshTokens,
                                               PasswordHasherPort hasher, TokenIssuerPort tokenIssuer, RateLimiterPort rateLimiter,
                                               RateLimitProperties rateLimitProperties, SessionProperties sessions) {
        return new UserAccessService(users, refreshTokens, hasher, tokenIssuer, rateLimiter,
                rateLimitProperties.authToken().toPolicy(), sessions.accessTtl(), sessions.refreshTtl(), Clock.systemUTC());
    }

    @Bean
    public RAGUseCase ragUseCase(GeminiAiPort ai,
                                 VectorRepositoryPort vectorRepository,
                                 RateLimiterPort rateLimiter,
                                 RateLimitProperties rateLimitProperties,
                                 TelemetryPort telemetry) {
        return new RAGService(ai, vectorRepository, rateLimiter,
                rateLimitProperties.ragQuery().toPolicy(), rateLimitProperties.ragQueryGlobal().toPolicy(),
                telemetry);
    }

    @Bean
    public RAGIndexingUseCase ragIndexingUseCase(TechnologyRepositoryPort technologyRepository,
                                                 ProjectRepositoryPort projectRepository,
                                                 ArticleRepositoryPort articleRepository,
                                                 CareerStoryPort careerStory,
                                                 CodeSourcePort codeSource,
                                                 GeminiAiPort ai,
                                                 VectorRepositoryPort vectorRepository,
                                                 ArchitectureProjectRepositoryPort architectureProjects) {
        return new RAGIndexingService(technologyRepository, projectRepository, articleRepository, careerStory,
                codeSource, ai, vectorRepository, architectureProjects);
    }

    @Bean
    public SystemHealthUseCase systemHealthUseCase(SystemProbePort probe) {
        return new SystemHealthService(probe);
    }

    @Bean
    public CareerUseCase careerUseCase(CareerStoryPort careerStory) {
        return new CareerService(careerStory);
    }

    @Bean
    public CvUseCase cvUseCase(CareerStoryPort careerStory, CvRendererPort renderer, ProfilePhotoPort photos) {
        return new CvService(careerStory, renderer, photos);
    }

    @Bean
    public ArchitectureProjectUseCase architectureProjectUseCase(ArchitectureProjectRepositoryPort repository, ArchitectureGraphRules rules,
                                                                 ObjectProvider<FeatureFlags> flags, SystemDesignRules systemRules) {
        // Sin proveedor de flags (un contexto parcial), todas cuentan como apagadas.
        return new ArchitectureProjectService(repository, rules, flag -> {
            FeatureFlags provider = flags.getIfAvailable();
            return provider != null && provider.isEnabled(flag);
        }, systemRules);
    }

    /**
     * Reglas del grafo del Estudio, que el frontend exporta con {@code npm run export:presets}.
     * Van en el classpath: si faltan o no se leen, la aplicación no arranca, porque sin ellas
     * se guardaría cualquier grafo.
     */
    @Bean
    public ArchitectureGraphRules architectureGraphRules(ObjectMapper objectMapper) {
        try (InputStream json = new ClassPathResource(GRAPH_RULES).getInputStream()) {
            return objectMapper.readValue(json, ArchitectureGraphRules.class);
        } catch (IOException e) {
            throw new UncheckedIOException("No se pudieron leer las reglas del grafo (" + GRAPH_RULES + ")", e);
        }
    }

    @Bean
    public ArchitectureCopilotUseCase architectureCopilotUseCase(GeminiAiPort ai,
                                                               VectorRepositoryPort vectorRepository,
                                                               CloudCatalogUseCase catalog,
                                                               RateLimiterPort rateLimiter,
                                                               RateLimitProperties rateLimitProperties,
                                                               TelemetryPort telemetry) {
        return new ArchitectureCopilotService(ai, vectorRepository, catalog, rateLimiter,
                rateLimitProperties.ragQuery().toPolicy(), rateLimitProperties.ragQueryGlobal().toPolicy(), telemetry);
    }

    @Bean
    public CloudCatalogUseCase cloudCatalogUseCase(CloudCatalogRepositoryPort repository, CachePort cache) {
        return new CloudCatalogService(repository, cache);
    }

    @Bean
    public TerraformUseCase terraformUseCase(RateLimiterPort rateLimiter, RateLimitProperties rateLimitProperties) {
        return new TerraformService(rateLimiter, rateLimitProperties.terraform().toPolicy());
    }

    @Bean
    public McpAccessUseCase mcpAccessUseCase(RateLimiterPort rateLimiter, RateLimitProperties rateLimitProperties) {
        return new McpAccessService(rateLimiter, rateLimitProperties.mcp().toPolicy(), rateLimitProperties.mcpGlobal().toPolicy());
    }

    /** Comparte el cupo del generador de Terraform: las dos cosas compilan lo mismo a partir de un lienzo. */
    @Bean
    public SystemDesignUseCase systemDesignUseCase(SystemDesignRules rules, RateLimiterPort rateLimiter, RateLimitProperties rateLimitProperties,
                                                   ArchitectureProjectRepositoryPort projects) {
        return new SystemDesignService(rules, rateLimiter, rateLimitProperties.terraform().toPolicy(), projects);
    }

    /** Catálogo y reglas del diseño de sistemas, que el frontend exporta con {@code npm run export:presets}. */
    @Bean
    public SystemDesignRules systemDesignRules(ObjectMapper objectMapper) {
        try (InputStream json = new ClassPathResource(SYSTEM_DESIGN).getInputStream()) {
            return objectMapper.readValue(json, SystemDesignRules.class);
        } catch (IOException e) {
            throw new UncheckedIOException("No se pudo leer el catálogo del diseño de sistemas (" + SYSTEM_DESIGN + ")", e);
        }
    }

    @Bean
    public ProfilePhotoUseCase profilePhotoUseCase(ProfilePhotoPort photos) {
        return new ProfilePhotoService(photos);
    }

    @Bean
    public ArticleUseCase articleUseCase(ArticleRepositoryPort repository, CachePort cache) {
        return new ArticleService(repository, cache);
    }
}
