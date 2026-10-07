package dev.portfolio.domain.exception;

import java.time.Duration;

public class RateLimitExceededException extends RuntimeException {

    private final int limit;
    private final Duration retryAfter;

    public RateLimitExceededException(int limit, Duration retryAfter) {
        super("Límite de %d peticiones excedido".formatted(limit));
        this.limit = limit;
        this.retryAfter = retryAfter;
    }

    public int getLimit() {
        return limit;
    }

    public Duration getRetryAfter() {
        return retryAfter;
    }
}
