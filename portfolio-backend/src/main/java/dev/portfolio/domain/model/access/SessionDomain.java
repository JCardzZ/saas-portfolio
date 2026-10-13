package dev.portfolio.domain.model.access;

import dev.portfolio.domain.model.AccessToken;

/**
 * Sesión recién abierta o renovada. El token de refresco es opaco y de un solo uso: el servidor
 * solo guarda su hash.
 */
public record SessionDomain(AccessToken accessToken, String refreshToken, long refreshExpiresInSeconds, UserProfileDomain user) {
}
