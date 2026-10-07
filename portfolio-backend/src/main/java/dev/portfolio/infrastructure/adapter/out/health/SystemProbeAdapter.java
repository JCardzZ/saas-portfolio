package dev.portfolio.infrastructure.adapter.out.health;

import dev.portfolio.application.port.out.SystemProbePort;
import dev.portfolio.domain.model.SystemHealthDomain.CircuitState;
import dev.portfolio.domain.model.SystemHealthDomain.ComponentHealth;
import io.github.resilience4j.circuitbreaker.CircuitBreaker;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataAccessException;
import org.springframework.data.redis.connection.RedisConnection;
import org.springframework.data.redis.core.RedisCallback;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.SQLException;

/**
 * El endpoint de salud es público: las descripciones nunca incluyen mensajes de excepción,
 * hosts ni credenciales; el detalle del fallo va solo al log.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class SystemProbeAdapter implements SystemProbePort {

    private static final int DATABASE_VALIDATION_TIMEOUT_SECONDS = 2;

    private final DataSource dataSource;
    private final StringRedisTemplate redisTemplate;
    private final CircuitBreaker aiEngineCircuitBreaker;

    @Override
    public ComponentHealth database() {
        try (Connection connection = dataSource.getConnection()) {
            DatabaseMetaData metaData = connection.getMetaData();
            String product = metaData.getDatabaseProductName() + " " + metaData.getDatabaseMajorVersion();
            return connection.isValid(DATABASE_VALIDATION_TIMEOUT_SECONDS)
                    ? new ComponentHealth(true, product + " - Connected")
                    : new ComponentHealth(false, product + " - Unavailable");
        } catch (SQLException e) {
            log.warn("Database health probe failed: {}", e.getMessage());
            return new ComponentHealth(false, "Database - Unavailable");
        }
    }

    @Override
    public ComponentHealth cache() {
        try {
            String pong = redisTemplate.execute((RedisCallback<String>) RedisConnection::ping);
            return "PONG".equalsIgnoreCase(pong)
                    ? new ComponentHealth(true, "Redis - Healthy")
                    : new ComponentHealth(false, "Redis - Unavailable");
        } catch (DataAccessException e) {
            log.warn("Redis health probe failed: {}", e.getMessage());
            return new ComponentHealth(false, "Redis - Unavailable");
        }
    }

    @Override
    public CircuitState aiEngineCircuit() {
        return switch (aiEngineCircuitBreaker.getState()) {
            case OPEN, FORCED_OPEN -> CircuitState.OPEN;
            case HALF_OPEN -> CircuitState.HALF_OPEN;
            case CLOSED, DISABLED, METRICS_ONLY -> CircuitState.CLOSED;
        };
    }
}
