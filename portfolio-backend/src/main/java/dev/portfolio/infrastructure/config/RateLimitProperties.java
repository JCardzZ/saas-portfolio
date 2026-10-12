package dev.portfolio.infrastructure.config;

import dev.portfolio.domain.model.RateLimitPolicy;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

@ConfigurationProperties(prefix = "security.rate-limit")
public record RateLimitProperties(Limit authToken, Limit ragQuery, Limit ragQueryGlobal, Limit terraform, Limit pricing,
                                  Limit mcp, Limit mcpGlobal) {

    public RateLimitProperties {
        // Con valores por defecto: un contexto que no cargue application.yml no se queda sin límites del servidor MCP.
        mcp = mcp == null ? new Limit(30, Duration.ofMinutes(1)) : mcp;
        mcpGlobal = mcpGlobal == null ? new Limit(2000, Duration.ofHours(24)) : mcpGlobal;
    }

    public record Limit(int maxRequests, Duration window) {

        public RateLimitPolicy toPolicy() {
            return new RateLimitPolicy(maxRequests, window);
        }
    }
}
