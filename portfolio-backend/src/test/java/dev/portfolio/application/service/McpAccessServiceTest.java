package dev.portfolio.application.service;

import dev.portfolio.application.port.in.McpAccessUseCase;
import dev.portfolio.application.port.out.RateLimiterPort;
import dev.portfolio.domain.exception.RateLimitExceededException;
import dev.portfolio.domain.model.RateLimitDecision;
import dev.portfolio.domain.model.RateLimitPolicy;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class McpAccessServiceTest {

    private static final RateLimitPolicy PER_CLIENT = new RateLimitPolicy(3, Duration.ofMinutes(1));
    private static final RateLimitPolicy DAILY = new RateLimitPolicy(5, Duration.ofHours(24));

    private final Map<String, AtomicInteger> counters = new ConcurrentHashMap<>();
    private final List<String> asked = new ArrayList<>();
    private final RateLimiterPort limiter = (key, policy) -> {
        asked.add(key + "@" + policy.maxRequests());
        int used = counters.computeIfAbsent(key, ignored -> new AtomicInteger()).incrementAndGet();
        return new RateLimitDecision(used <= policy.maxRequests(), policy.maxRequests(), Math.max(0, policy.maxRequests() - used), Duration.ofSeconds(30));
    };
    private final McpAccessService service = new McpAccessService(limiter, PER_CLIENT, DAILY);

    @Test
    void countsEachCallAgainstItsOriginAndAgainstTheDailyTotal() {
        service.admit("10.0.0.1");

        assertThat(asked).containsExactly("mcp:10.0.0.1@3", "mcp:global@5");
    }

    @Test
    void stopsAnOriginThatSpentItsShareWithoutTouchingTheOthers() {
        for (int call = 0; call < 3; call++) {
            service.admit("10.0.0.1");
        }

        assertThatThrownBy(() -> service.admit("10.0.0.1")).isInstanceOf(RateLimitExceededException.class);
        // La llamada rechazada no gasta del tope de todos.
        assertThat(counters.get("mcp:global").get()).isEqualTo(3);
        assertThatCode(() -> service.admit("10.0.0.2")).doesNotThrowAnyException();
    }

    @Test
    void stopsEveryoneOnceTheDailyTotalIsSpent() {
        for (int call = 0; call < 5; call++) {
            service.admit("origen-" + call);
        }

        assertThatThrownBy(() -> service.admit("origen-nuevo")).isInstanceOf(RateLimitExceededException.class)
                .satisfies(error -> assertThat(((RateLimitExceededException) error).getRetryAfter()).isEqualTo(Duration.ofSeconds(30)));
    }

    @Test
    void tellsItsLimits() {
        assertThat(service.limits()).isEqualTo(new McpAccessUseCase.Limits(3, 60, 5));
    }
}
