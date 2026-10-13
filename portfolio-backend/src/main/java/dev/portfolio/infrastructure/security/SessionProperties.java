package dev.portfolio.infrastructure.security;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

import java.time.Duration;

/**
 * @param accessTtl      vida del token de acceso de una persona; corta, porque no se puede revocar
 * @param refreshTtl     vida del token de refresco, que sí se revoca
 * @param bootstrapEmail correo del primer administrador, que se crea al arrancar si no hay cuentas
 */
@ConfigurationProperties(prefix = "security.sessions")
public record SessionProperties(
        @DefaultValue("15m") Duration accessTtl,
        @DefaultValue("7d") Duration refreshTtl,
        @DefaultValue("") String bootstrapEmail,
        @DefaultValue("") String bootstrapPassword
) {
}
