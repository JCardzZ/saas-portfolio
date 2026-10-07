package dev.portfolio.application.port.in;

public interface RAGIndexingUseCase {

    /**
     * Regenera por completo el índice del tenant a partir del contenido del CMS y del código fuente.
     *
     * @return número de fragmentos indexados
     */
    int reindex(String tenantId);
}
