package dev.portfolio.domain.model;

import java.time.Duration;

/**
 * @param retryAfter tiempo hasta que la ventana actual se reinicia
 */
public record RateLimitDecision(boolean allowed, int limit, int remaining, Duration retryAfter) {

    public static RateLimitDecision unrestricted(RateLimitPolicy policy) {
        return new RateLimitDecision(true, policy.maxRequests(), policy.maxRequests(), Duration.ZERO);
    }
}
