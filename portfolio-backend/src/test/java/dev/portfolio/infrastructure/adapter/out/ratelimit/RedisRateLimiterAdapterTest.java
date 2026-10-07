package dev.portfolio.infrastructure.adapter.out.ratelimit;

import dev.portfolio.domain.model.RateLimitDecision;
import dev.portfolio.domain.model.RateLimitPolicy;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.RedisConnectionFailureException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;

import java.time.Duration;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.mock;

class RedisRateLimiterAdapterTest {

    private static final RateLimitPolicy POLICY = new RateLimitPolicy(5, Duration.ofMinutes(1));

    private final StringRedisTemplate redisTemplate = mock(StringRedisTemplate.class);
    private final RedisRateLimiterAdapter adapter = new RedisRateLimiterAdapter(redisTemplate);

    @Test
    void allowsRequestsWithinTheLimit() {
        givenRedisReturns(5L, 30_000L);

        RateLimitDecision decision = adapter.tryAcquire("auth-token:1.2.3.4", POLICY);

        assertThat(decision.allowed()).isTrue();
        assertThat(decision.limit()).isEqualTo(5);
        assertThat(decision.remaining()).isZero();
    }

    @Test
    void rejectsRequestsOverTheLimitAndReportsWindowReset() {
        givenRedisReturns(6L, 30_000L);

        RateLimitDecision decision = adapter.tryAcquire("auth-token:1.2.3.4", POLICY);

        assertThat(decision.allowed()).isFalse();
        assertThat(decision.remaining()).isZero();
        assertThat(decision.retryAfter()).isEqualTo(Duration.ofSeconds(30));
    }

    @Test
    void failsOpenWhenRedisIsUnavailable() {
        given(redisTemplate.execute(any(RedisScript.class), any(List.class), any(Object[].class)))
                .willThrow(new RedisConnectionFailureException("down"));

        RateLimitDecision decision = adapter.tryAcquire("auth-token:1.2.3.4", POLICY);

        assertThat(decision.allowed()).isTrue();
    }

    private void givenRedisReturns(long count, long windowRemainingMillis) {
        given(redisTemplate.execute(
                any(RedisScript.class), eq(List.of("portfolio:ratelimit:auth-token:1.2.3.4")), eq("60000")))
                .willReturn(List.of(count, windowRemainingMillis));
    }
}
