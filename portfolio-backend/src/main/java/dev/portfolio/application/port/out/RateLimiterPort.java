package dev.portfolio.application.port.out;

import dev.portfolio.domain.model.RateLimitDecision;
import dev.portfolio.domain.model.RateLimitPolicy;

public interface RateLimiterPort {

    /**
     * Registra una petición para {@code key} y decide si cabe dentro de la política.
     * Si el almacén subyacente falla, las implementaciones deben permitir la petición
     * (fail-open) en lugar de propagar el error.
     */
    RateLimitDecision tryAcquire(String key, RateLimitPolicy policy);
}
