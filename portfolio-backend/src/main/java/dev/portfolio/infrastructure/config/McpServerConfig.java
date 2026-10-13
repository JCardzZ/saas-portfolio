package dev.portfolio.infrastructure.config;

import dev.portfolio.application.port.in.ArchitectureProjectUseCase;
import dev.portfolio.application.port.in.CloudCatalogUseCase;
import dev.portfolio.application.port.in.McpAccessUseCase;
import dev.portfolio.application.port.in.PricingUseCase;
import dev.portfolio.application.port.in.ProjectUseCase;
import dev.portfolio.application.port.in.RAGUseCase;
import dev.portfolio.application.port.in.SystemDesignUseCase;
import dev.portfolio.application.port.in.TerraformUseCase;
import dev.portfolio.application.port.out.FeatureFlags;
import dev.portfolio.application.port.out.TelemetryPort;
import dev.portfolio.infrastructure.observability.McpToolTelemetry;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import io.opentelemetry.api.GlobalOpenTelemetry;
import io.opentelemetry.api.OpenTelemetry;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import java.time.Clock;
import dev.portfolio.domain.model.FeatureFlagDomain;
import dev.portfolio.infrastructure.adapter.in.mcp.McpObserver;
import dev.portfolio.infrastructure.adapter.in.mcp.McpSdkServer;
import dev.portfolio.infrastructure.adapter.in.mcp.PortfolioCatalog;
import dev.portfolio.infrastructure.adapter.in.mcp.PortfolioTools;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.boot.web.servlet.ServletRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;
import org.springframework.http.MediaType;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

/**
 * Servidor MCP de la plataforma, en {@code /mcp} (bajo el context-path: {@code /v1/mcp}). Es un
 * adaptador de entrada más: sus herramientas llaman a los mismos casos de uso que la API REST.
 * No es Spring MVC (lo atiende el servlet del SDK), así que la flag {@code mcp.section} se
 * comprueba en un filtro propio: apagada, la ruta responde 404 como cualquier otra que no existe.
 */
@Configuration
public class McpServerConfig {

    @Bean(destroyMethod = "close")
    public McpSdkServer mcpSdkServer(ArchitectureProjectUseCase projects, TerraformUseCase terraform, PricingUseCase pricing, RAGUseCase rag,
                                     SystemDesignUseCase systemDesign, CloudCatalogUseCase cloudCatalog, ProjectUseCase portfolio,
                                     McpAccessUseCase access, ObjectProvider<McpObserver> observer) {
        return new McpSdkServer(
                PortfolioTools.all(projects, terraform, pricing, rag, systemDesign),
                PortfolioCatalog.resources(cloudCatalog, systemDesign, portfolio), PortfolioCatalog.prompts(),
                access, observer.getIfAvailable(() -> McpObserver.NONE));
    }

    /**
     * Métricas, traza y evento de cada llamada a una herramienta. La traza usa el OpenTelemetry que
     * haya configurado (un SDK o el agente de Java); sin ninguno, la API no exporta nada.
     */
    @Bean
    public McpToolTelemetry mcpObserver(MeterRegistry meters, ObjectProvider<OpenTelemetry> openTelemetry, TelemetryPort telemetry) {
        return new McpToolTelemetry(meters, openTelemetry.getIfAvailable(GlobalOpenTelemetry::get), telemetry, Clock.systemUTC());
    }

    /** La aplicación no lleva Actuator: las métricas viven en este registro en memoria, del que lee el estado público del servidor MCP. */
    @Bean
    @ConditionalOnMissingBean
    public MeterRegistry meterRegistry() {
        return new SimpleMeterRegistry();
    }

    @Bean
    public ServletRegistrationBean<HttpServlet> mcpServlet(McpSdkServer server) {
        ServletRegistrationBean<HttpServlet> registration = new ServletRegistrationBean<>(server.servlet(), McpSdkServer.ENDPOINT);
        registration.setName("mcp");
        // Las respuestas pueden ser un flujo de eventos (SSE): el servlet las atiende en asíncrono.
        registration.setAsyncSupported(true);
        return registration;
    }

    @Bean
    public FilterRegistrationBean<McpFlagFilter> mcpFlagFilter(ObjectProvider<FeatureFlags> flags) {
        FilterRegistrationBean<McpFlagFilter> registration = new FilterRegistrationBean<>(new McpFlagFilter(flags));
        registration.addUrlPatterns(McpSdkServer.ENDPOINT);
        registration.setOrder(Ordered.HIGHEST_PRECEDENCE + 10);
        return registration;
    }

    /** Con la flag apagada (o sin proveedor de flags), el servidor MCP no existe. */
    static final class McpFlagFilter extends OncePerRequestFilter {

        private final ObjectProvider<FeatureFlags> flags;

        McpFlagFilter(ObjectProvider<FeatureFlags> flags) {
            this.flags = flags;
        }

        @Override
        protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain) throws ServletException, IOException {
            FeatureFlags provider = flags.getIfAvailable();
            if (provider != null && provider.isEnabled(FeatureFlagDomain.MCP_SECTION)) {
                chain.doFilter(request, response);
                return;
            }
            response.setStatus(HttpServletResponse.SC_NOT_FOUND);
            response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
            response.setCharacterEncoding(StandardCharsets.UTF_8.name());
            response.getWriter().write("{\"status\":404,\"code\":\"RESOURCE_NOT_FOUND\",\"title\":\"Recurso no encontrado\"}");
        }
    }
}
