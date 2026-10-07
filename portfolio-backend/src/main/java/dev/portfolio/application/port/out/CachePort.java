package dev.portfolio.application.port.out;

import java.time.Duration;
import java.util.List;
import java.util.Optional;

/**
 * La caché es best-effort: las implementaciones no deben propagar fallos del
 * almacén subyacente. Un error de lectura se reporta como miss (Optional vacío).
 */
public interface CachePort {

    <T> Optional<List<T>> getList(String key, Class<T> elementType);

    void put(String key, Object value, Duration ttl);

    void evict(String... keys);
}
