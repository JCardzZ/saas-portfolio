package dev.portfolio.infrastructure.adapter.out.ratelimit;

import dev.portfolio.application.port.out.RateLimiterPort;
import dev.portfolio.domain.model.RateLimitDecision;
import dev.portfolio.domain.model.RateLimitPolicy;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataAccessException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.List;

/**
 * Ventana fija por clave. El contador y su expiración se actualizan en un único
 * script Lua para que sean atómicos entre instancias.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class RedisRateLimiterAdapter implements RateLimiterPort {

    private static final String KEY_PREFIX = "portfolio:ratelimit:";

    // Devuelve {contador, ms restantes de la ventana}. El segundo PEXPIRE cubre
    // una clave que hubiera quedado sin TTL, que de otro modo bloquearía para siempre.
    @SuppressWarnings("rawtypes")
    private static final RedisScript<List> FIXED_WINDOW_SCRIPT = new DefaultRedisScript<>("""
            local current = redis.call('INCR', KEYS[1])
            if current == 1 then
              redis.call('PEXPIRE', KEYS[1], ARGV[1])
            end
            local ttl = redis.call('PTTL', KEYS[1])
            if ttl < 0 then
              redis.call('PEXPIRE', KEYS[1], ARGV[1])
              ttl = tonumber(ARGV[1])
            end
            return {current, ttl}
            """, List.class);

    private final StringRedisTemplate redisTemplate;

    @Override
    public RateLimitDecision tryAcquire(String key, RateLimitPolicy policy) {
        try {
            List<?> result = redisTemplate.execute(
                    FIXED_WINDOW_SCRIPT, List.of(KEY_PREFIX + key), String.valueOf(policy.window().toMillis()));
            if (result == null || result.size() < 2) {
                log.warn("Rate limiter returned no result for key '{}', allowing request", key);
                return RateLimitDecision.unrestricted(policy);
            }
            long count = ((Number) result.get(0)).longValue();
            long windowRemainingMillis = ((Number) result.get(1)).longValue();
            int remaining = (int) Math.max(0, policy.maxRequests() - count);
            return new RateLimitDecision(
                    count <= policy.maxRequests(),
                    policy.maxRequests(),
                    remaining,
                    Duration.ofMillis(windowRemainingMillis));
        } catch (DataAccessException e) {
            log.warn("Rate limiter unavailable for key '{}', allowing request: {}", key, e.getMessage());
            return RateLimitDecision.unrestricted(policy);
        }
    }
}
