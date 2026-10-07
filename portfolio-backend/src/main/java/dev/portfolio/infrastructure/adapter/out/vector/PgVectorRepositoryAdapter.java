package dev.portfolio.infrastructure.adapter.out.vector;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.portfolio.application.port.out.VectorRepositoryPort;
import dev.portfolio.domain.model.EmbeddingDomain;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;

/**
 * JDBC directo en lugar de JPA: Hibernate no mapea el tipo {@code vector} sin un módulo
 * adicional, y aquí solo hacen falta cuatro sentencias. Toda consulta filtra por tenant_id.
 */
@Component
@RequiredArgsConstructor
public class PgVectorRepositoryAdapter implements VectorRepositoryPort {

    private static final int BATCH_SIZE = 100;
    private static final TypeReference<Map<String, String>> METADATA_TYPE = new TypeReference<>() {
    };

    // Reindexar un fragmento ya existente lo actualiza en lugar de duplicarlo.
    private static final String UPSERT = """
            INSERT INTO document_embeddings (id, tenant_id, source_id, chunk_index, content, metadata, embedding)
            VALUES (?, ?, ?, ?, ?, ?::jsonb, ?::vector)
            ON CONFLICT (tenant_id, source_id, chunk_index)
            DO UPDATE SET content = EXCLUDED.content, metadata = EXCLUDED.metadata, embedding = EXCLUDED.embedding
            """;

    // <=> es distancia coseno. Con muchos tenants el índice HNSW filtra después de buscar y
    // puede devolver menos de `limit` filas; entonces conviene activar hnsw.iterative_scan.
    private static final String FIND_MOST_SIMILAR = """
            SELECT id, tenant_id, source_id, chunk_index, content,
                   metadata::text AS metadata, embedding::text AS embedding
            FROM document_embeddings
            WHERE tenant_id = ?
            ORDER BY embedding <=> ?::vector
            LIMIT ?
            """;

    private static final String DELETE_BY_SOURCE =
            "DELETE FROM document_embeddings WHERE tenant_id = ? AND source_id = ?";
    private static final String DELETE_BY_TENANT = "DELETE FROM document_embeddings WHERE tenant_id = ?";

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;

    private final RowMapper<EmbeddingDomain> rowMapper = (rs, rowNum) -> new EmbeddingDomain(
            rs.getString("id"),
            rs.getString("tenant_id"),
            rs.getString("source_id"),
            rs.getInt("chunk_index"),
            rs.getString("content"),
            readMetadata(rs.getString("metadata")),
            VectorLiteral.parse(rs.getString("embedding")));

    @Override
    @Transactional
    public void saveAll(List<EmbeddingDomain> embeddings) {
        jdbcTemplate.batchUpdate(UPSERT, embeddings, BATCH_SIZE, (statement, embedding) -> {
            statement.setString(1, embedding.id());
            statement.setString(2, embedding.tenantId());
            statement.setString(3, embedding.sourceId());
            statement.setInt(4, embedding.chunkIndex());
            statement.setString(5, embedding.content());
            statement.setString(6, writeMetadata(embedding.metadata()));
            statement.setString(7, VectorLiteral.format(embedding.vector()));
        });
    }

    @Override
    @Transactional
    public void replaceAllForTenant(String tenantId, List<EmbeddingDomain> embeddings) {
        deleteAllByTenant(tenantId);
        saveAll(embeddings);
    }

    @Override
    @Transactional(readOnly = true)
    public List<EmbeddingDomain> findMostSimilar(String tenantId, float[] queryVector, int limit) {
        return jdbcTemplate.query(FIND_MOST_SIMILAR, rowMapper, tenantId, VectorLiteral.format(queryVector), limit);
    }

    @Override
    @Transactional
    public void deleteBySource(String tenantId, String sourceId) {
        jdbcTemplate.update(DELETE_BY_SOURCE, tenantId, sourceId);
    }

    @Override
    @Transactional
    public void deleteAllByTenant(String tenantId) {
        jdbcTemplate.update(DELETE_BY_TENANT, tenantId);
    }

    private String writeMetadata(Map<String, String> metadata) {
        try {
            return objectMapper.writeValueAsString(metadata);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("No se pudo serializar la metadata del embedding", e);
        }
    }

    private Map<String, String> readMetadata(String json) {
        try {
            return objectMapper.readValue(json, METADATA_TYPE);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Metadata de embedding ilegible", e);
        }
    }
}
