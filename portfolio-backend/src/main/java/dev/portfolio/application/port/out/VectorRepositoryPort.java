package dev.portfolio.application.port.out;

import dev.portfolio.domain.model.EmbeddingDomain;

import java.util.List;

/**
 * Todas las operaciones están acotadas a un tenant: ninguna lee ni borra datos de otro.
 */
public interface VectorRepositoryPort {

    void saveAll(List<EmbeddingDomain> embeddings);

    /** Sustituye de forma atómica todo el índice del tenant: nadie lo ve vacío ni a medias. */
    void replaceAllForTenant(String tenantId, List<EmbeddingDomain> embeddings);

    /** @return los fragmentos del tenant más cercanos a {@code queryVector}, del más al menos afín */
    List<EmbeddingDomain> findMostSimilar(String tenantId, float[] queryVector, int limit);

    void deleteBySource(String tenantId, String sourceId);

    void deleteAllByTenant(String tenantId);
}
