package dev.portfolio.infrastructure.security;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "security.admin-client")
public record AdminClientProperties(String id, String secret) {
}
