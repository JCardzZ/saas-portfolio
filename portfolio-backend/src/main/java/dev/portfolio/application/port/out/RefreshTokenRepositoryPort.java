package dev.portfolio.application.port.out;

import dev.portfolio.domain.model.access.RefreshTokenDomain;

import java.time.Instant;
import java.util.Optional;

/** Tokens de refresco, guardados por su hash: el valor nunca se almacena. */
public interface RefreshTokenRepositoryPort {

    void save(RefreshTokenDomain token);

    Optional<RefreshTokenDomain> findByHash(String tokenHash);

    /**
     * Marca el token como usado. Es atómico: de dos peticiones simultáneas con el mismo token,
     * solo una recibe {@code true}.
     */
    boolean revoke(String tokenHash, Instant at);

    /** Cierra todas las sesiones de un usuario. */
    void revokeAllOf(String userId, Instant at);
}
