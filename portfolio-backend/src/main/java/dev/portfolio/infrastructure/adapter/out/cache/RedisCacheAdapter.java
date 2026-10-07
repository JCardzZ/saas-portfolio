package dev.portfolio.infrastructure.adapter.out.cache;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JavaType;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.portfolio.application.port.out.CachePort;
import dev.portfolio.application.port.out.TelemetryPort;
import dev.portfolio.domain.model.TelemetryEventType;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataAccessException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.List;
import java.util.Optional;

@Slf4j
@Component
@RequiredArgsConstructor
public class RedisCacheAdapter implements CachePort {

    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;
    private final TelemetryPort telemetry;

    @Override
    public <T> Optional<List<T>> getList(String key, Class<T> elementType) {
        try {
            String json = redisTemplate.opsForValue().get(key);
            if (json == null) {
                telemetry.publish(TelemetryEventType.CACHE_MISS, key);
                return Optional.empty();
            }
            JavaType listType = objectMapper.getTypeFactory().constructCollectionType(List.class, elementType);
            List<T> value = objectMapper.readValue(json, listType);
            telemetry.publish(TelemetryEventType.CACHE_HIT, key);
            return Optional.of(value);
        } catch (DataAccessException | JsonProcessingException e) {
            log.warn("Cache read failed for key '{}', falling back to source: {}", key, e.getMessage());
            return Optional.empty();
        }
    }

    @Override
    public void put(String key, Object value, Duration ttl) {
        try {
            redisTemplate.opsForValue().set(key, objectMapper.writeValueAsString(value), ttl);
        } catch (DataAccessException | JsonProcessingException e) {
            log.warn("Cache write failed for key '{}': {}", key, e.getMessage());
        }
    }

    @Override
    public void evict(String... keys) {
        try {
            redisTemplate.delete(List.of(keys));
        } catch (DataAccessException e) {
            log.warn("Cache eviction failed for keys {}, entries expire by TTL: {}", List.of(keys), e.getMessage());
        }
    }
}
