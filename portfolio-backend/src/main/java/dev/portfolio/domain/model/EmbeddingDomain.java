package dev.portfolio.domain.model;

import java.util.Map;

/**
 * Fragmento de un documento junto con su vector de embedding.
 *
 * @param sourceId   origen del fragmento (p. ej. la ruta del archivo indexado)
 * @param chunkIndex posición del fragmento dentro de su origen
 */
public record EmbeddingDomain(
        String id,
        String tenantId,
        String sourceId,
        int chunkIndex,
        String content,
        Map<String, String> metadata,
        float[] vector
) {

    /** Debe coincidir con la columna {@code vector(768)} de {@code document_embeddings}. */
    public static final int DIMENSIONS = 768;

    public EmbeddingDomain {
        if (tenantId == null || tenantId.isBlank()) {
            throw new IllegalArgumentException("tenantId es obligatorio");
        }
        if (vector == null || vector.length != DIMENSIONS) {
            throw new IllegalArgumentException("El vector debe tener %d dimensiones".formatted(DIMENSIONS));
        }
        metadata = metadata == null ? Map.of() : Map.copyOf(metadata);
        vector = vector.clone();
    }

    // Los arrays son mutables: se devuelve una copia para que el record siga siendo inmutable.
    @Override
    public float[] vector() {
        return vector.clone();
    }
}
