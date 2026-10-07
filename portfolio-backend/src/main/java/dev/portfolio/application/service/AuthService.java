package dev.portfolio.application.service;

import dev.portfolio.application.port.in.AuthUseCase;
import dev.portfolio.application.port.out.ClientAuthenticatorPort;
import dev.portfolio.application.port.out.RateLimiterPort;
import dev.portfolio.application.port.out.TokenIssuerPort;
import dev.portfolio.domain.exception.InvalidCredentialsException;
import dev.portfolio.domain.exception.RateLimitExceededException;
import dev.portfolio.domain.exception.UnsupportedGrantTypeException;
import dev.portfolio.domain.model.AccessToken;
import dev.portfolio.domain.model.ClientCredentials;
import dev.portfolio.domain.model.ClientIdentity;
import dev.portfolio.domain.model.RateLimitDecision;
import dev.portfolio.domain.model.RateLimitPolicy;

public class AuthService implements AuthUseCase {

    private static final String RATE_LIMIT_KEY_PREFIX = "auth-token:";

    private final ClientAuthenticatorPort clientAuthenticator;
    private final TokenIssuerPort tokenIssuer;
    private final RateLimiterPort rateLimiter;
    private final RateLimitPolicy rateLimitPolicy;

    public AuthService(ClientAuthenticatorPort clientAuthenticator,
                       TokenIssuerPort tokenIssuer,
                       RateLimiterPort rateLimiter,
                       RateLimitPolicy rateLimitPolicy) {
        this.clientAuthenticator = clientAuthenticator;
        this.tokenIssuer = tokenIssuer;
        this.rateLimiter = rateLimiter;
        this.rateLimitPolicy = rateLimitPolicy;
    }

    @Override
    public AccessToken issueToken(ClientCredentials credentials, String clientAddress) {
        // Se cuenta cada intento, válido o no, antes de tocar las credenciales.
        RateLimitDecision decision = rateLimiter.tryAcquire(RATE_LIMIT_KEY_PREFIX + clientAddress, rateLimitPolicy);
        if (!decision.allowed()) {
            throw new RateLimitExceededException(decision.limit(), decision.retryAfter());
        }
        if (!credentials.usesSupportedGrant()) {
            throw new UnsupportedGrantTypeException(credentials.grantType());
        }
        ClientIdentity identity = clientAuthenticator
                .authenticate(credentials.clientId(), credentials.clientSecret())
                .orElseThrow(InvalidCredentialsException::new);
        return tokenIssuer.issue(identity);
    }
}
