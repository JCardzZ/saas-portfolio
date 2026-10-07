package dev.portfolio.infrastructure.security;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

import java.time.Duration;

/**
 * @param secret     clave HMAC en Base64 (mínimo 256 bits), p. ej. {@code openssl rand -base64 32}
 * @param expiration vigencia de los tokens emitidos
 */
@ConfigurationProperties(prefix = "security.jwt")
public record JwtProperties(String secret, @DefaultValue("1h") Duration expiration) {
}
