package dev.portfolio.domain.model;

import java.time.Duration;

public record RateLimitPolicy(int maxRequests, Duration window) {

    public RateLimitPolicy {
        if (maxRequests < 1 || window == null || window.isZero() || window.isNegative()) {
            throw new IllegalArgumentException("RateLimitPolicy requiere maxRequests >= 1 y una ventana positiva");
        }
    }
}
