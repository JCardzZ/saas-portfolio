package dev.portfolio.domain.model.access;

import java.time.Instant;

/** Token de refresco tal como se guarda: su hash, de quién es, cuándo caduca y si ya se usó. */
public record RefreshTokenDomain(String tokenHash, String userId, Instant expiresAt, Instant revokedAt) {

    public boolean revoked() {
        return revokedAt != null;
    }

    public boolean expiredAt(Instant now) {
        return !expiresAt.isAfter(now);
    }
}
