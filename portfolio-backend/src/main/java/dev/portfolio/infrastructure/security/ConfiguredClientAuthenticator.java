package dev.portfolio.infrastructure.security;

import dev.portfolio.application.port.out.ClientAuthenticatorPort;
import dev.portfolio.domain.model.ClientIdentity;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.List;
import java.util.Optional;

/**
 * Autentica al único cliente administrador, cuyas credenciales llegan por configuración.
 */
@Component
public class ConfiguredClientAuthenticator implements ClientAuthenticatorPort {

    private static final List<String> ADMIN_ROLES = List.of("ROLE_ADMIN");

    private final AdminClientProperties properties;

    public ConfiguredClientAuthenticator(AdminClientProperties properties) {
        if (!StringUtils.hasText(properties.id()) || !StringUtils.hasText(properties.secret())) {
            throw new IllegalStateException("security.admin-client.id y security.admin-client.secret son obligatorios");
        }
        this.properties = properties;
    }

    @Override
    public Optional<ClientIdentity> authenticate(String clientId, String clientSecret) {
        // Se evalúan siempre ambas comparaciones para no revelar por tiempo cuál de las dos falló.
        boolean idMatches = constantTimeEquals(properties.id(), clientId);
        boolean secretMatches = constantTimeEquals(properties.secret(), clientSecret);
        return idMatches && secretMatches
                ? Optional.of(new ClientIdentity(properties.id(), ADMIN_ROLES))
                : Optional.empty();
    }

    private static boolean constantTimeEquals(String expected, String actual) {
        return MessageDigest.isEqual(sha256(expected), sha256(actual == null ? "" : actual));
    }

    private static byte[] sha256(String value) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
