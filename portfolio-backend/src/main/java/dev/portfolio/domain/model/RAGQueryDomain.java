package dev.portfolio.domain.model;

import dev.portfolio.domain.exception.InvalidRequestException;

/**
 * @param maxResults número de fragmentos que se recuperan como contexto para la respuesta
 */
public record RAGQueryDomain(String tenantId, String prompt, int maxResults) {

    public static final int DEFAULT_MAX_RESULTS = 5;
    public static final int MAX_PROMPT_LENGTH = 2000;

    public RAGQueryDomain {
        if (tenantId == null || tenantId.isBlank()) {
            throw new IllegalArgumentException("tenantId es obligatorio");
        }
        if (maxResults < 1) {
            throw new IllegalArgumentException("maxResults debe ser al menos 1");
        }
        if (prompt == null || prompt.isBlank()) {
            throw new InvalidRequestException("La pregunta no puede estar vacía");
        }
        if (prompt.length() > MAX_PROMPT_LENGTH) {
            throw new InvalidRequestException(
                    "La pregunta no puede superar los %d caracteres".formatted(MAX_PROMPT_LENGTH));
        }
    }

    public static RAGQueryDomain of(String tenantId, String prompt) {
        return new RAGQueryDomain(tenantId, prompt, DEFAULT_MAX_RESULTS);
    }
}
