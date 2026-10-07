package dev.portfolio.infrastructure.adapter.out.cache;

import com.fasterxml.jackson.databind.ObjectMapper;
import dev.portfolio.application.port.out.TelemetryPort;
import dev.portfolio.domain.model.TechnologyDomain;
import dev.portfolio.domain.model.TelemetryEventType;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.RedisConnectionFailureException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

class RedisCacheAdapterTest {

    private static final String KEY = "portfolio:technologies:all";

    private final StringRedisTemplate redisTemplate = mock(StringRedisTemplate.class);
    @SuppressWarnings("unchecked")
    private final ValueOperations<String, String> values = mock(ValueOperations.class);
    private final TelemetryPort telemetry = mock(TelemetryPort.class);
    private final RedisCacheAdapter adapter = new RedisCacheAdapter(redisTemplate, new ObjectMapper(), telemetry);

    @BeforeEach
    void setUp() {
        given(redisTemplate.opsForValue()).willReturn(values);
    }

    @Test
    void reportsACacheHitWhenTheKeyIsPresent() {
        given(values.get(KEY)).willReturn("""
                [{"id":"t1","name":"Java 21","category":"Backend","proficiencyLevel":"Expert","iconUrl":"u","featured":true}]""");

        assertThat(adapter.getList(KEY, TechnologyDomain.class)).hasValueSatisfying(list ->
                assertThat(list).extracting(TechnologyDomain::name).containsExactly("Java 21"));
        verify(telemetry).publish(TelemetryEventType.CACHE_HIT, KEY);
    }

    @Test
    void reportsACacheMissWhenTheKeyIsAbsent() {
        given(values.get(KEY)).willReturn(null);

        assertThat(adapter.getList(KEY, TechnologyDomain.class)).isEmpty();
        verify(telemetry).publish(TelemetryEventType.CACHE_MISS, KEY);
    }

    @Test
    void redisFailureFallsBackSilentlyAndIsNotReportedAsAMiss() {
        given(values.get(KEY)).willThrow(new RedisConnectionFailureException("down"));

        assertThat(adapter.getList(KEY, TechnologyDomain.class)).isEmpty();
        verifyNoInteractions(telemetry);
    }
}
