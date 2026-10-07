package dev.portfolio.domain.model;

import java.util.Map;

/**
 * Documento a indexar para RAG, antes de trocearlo.
 *
 * @param sourceId identificador estable del origen (ruta del archivo o {@code cms/projects/<id>})
 */
public record SourceDocumentDomain(String sourceId, String content, Map<String, String> metadata) {

    public SourceDocumentDomain {
        metadata = metadata == null ? Map.of() : Map.copyOf(metadata);
    }
}
