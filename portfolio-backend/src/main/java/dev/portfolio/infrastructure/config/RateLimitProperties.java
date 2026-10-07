package dev.portfolio.infrastructure.config;

import dev.portfolio.domain.model.RateLimitPolicy;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

@ConfigurationProperties(prefix = "security.rate-limit")
public record RateLimitProperties(Limit authToken, Limit ragQuery, Limit ragQueryGlobal, Limit terraform) {

    public record Limit(int maxRequests, Duration window) {

        public RateLimitPolicy toPolicy() {
            return new RateLimitPolicy(maxRequests, window);
        }
    }
}
