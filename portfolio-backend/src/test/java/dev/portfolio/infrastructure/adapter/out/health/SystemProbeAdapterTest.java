package dev.portfolio.infrastructure.adapter.out.health;

import dev.portfolio.domain.model.SystemHealthDomain.CircuitState;
import dev.portfolio.domain.model.SystemHealthDomain.ComponentHealth;
import io.github.resilience4j.circuitbreaker.CircuitBreaker;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.RedisConnectionFailureException;
import org.springframework.data.redis.core.RedisCallback;
import org.springframework.data.redis.core.StringRedisTemplate;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.SQLException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class SystemProbeAdapterTest {

    private final DataSource dataSource = mock(DataSource.class);
    private final StringRedisTemplate redisTemplate = mock(StringRedisTemplate.class);
    private final CircuitBreaker circuitBreaker = CircuitBreaker.ofDefaults("aiEngine");
    private final SystemProbeAdapter adapter = new SystemProbeAdapter(dataSource, redisTemplate, circuitBreaker);

    @Test
    void reportsDatabaseProductAndVersionWhenConnected() throws SQLException {
        Connection connection = mock(Connection.class);
        DatabaseMetaData metaData = mock(DatabaseMetaData.class);
        given(dataSource.getConnection()).willReturn(connection);
        given(connection.getMetaData()).willReturn(metaData);
        given(metaData.getDatabaseProductName()).willReturn("PostgreSQL");
        given(metaData.getDatabaseMajorVersion()).willReturn(16);
        given(connection.isValid(anyInt())).willReturn(true);

        assertThat(adapter.database()).isEqualTo(new ComponentHealth(true, "PostgreSQL 16 - Connected"));
        verify(connection).close();
    }

    @Test
    void databaseFailureIsReportedWithoutLeakingTheError() throws SQLException {
        given(dataSource.getConnection())
                .willThrow(new SQLException("Connection to db.internal:5432 refused for user admin"));

        ComponentHealth health = adapter.database();

        assertThat(health.healthy()).isFalse();
        assertThat(health.description()).isEqualTo("Database - Unavailable");
    }

    @Test
    void reportsRedisHealthFromPing() {
        given(redisTemplate.execute(any(RedisCallback.class))).willReturn("PONG");
        assertThat(adapter.cache()).isEqualTo(new ComponentHealth(true, "Redis - Healthy"));

        given(redisTemplate.execute(any(RedisCallback.class))).willThrow(new RedisConnectionFailureException("down"));
        assertThat(adapter.cache()).isEqualTo(new ComponentHealth(false, "Redis - Unavailable"));
    }

    @Test
    void reflectsTheCircuitBreakerState() {
        assertThat(adapter.aiEngineCircuit()).isEqualTo(CircuitState.CLOSED);

        circuitBreaker.transitionToOpenState();
        assertThat(adapter.aiEngineCircuit()).isEqualTo(CircuitState.OPEN);

        circuitBreaker.transitionToHalfOpenState();
        assertThat(adapter.aiEngineCircuit()).isEqualTo(CircuitState.HALF_OPEN);
    }
}
