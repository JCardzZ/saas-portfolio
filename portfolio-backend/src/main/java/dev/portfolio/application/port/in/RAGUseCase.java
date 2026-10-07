package dev.portfolio.application.port.in;

import dev.portfolio.domain.model.RAGAnswerDomain;
import dev.portfolio.domain.model.RAGQueryDomain;

public interface RAGUseCase {

    /**
     * Responde a la pregunta usando como contexto los fragmentos más afines del tenant.
     *
     * @param clientAddress origen de la petición, usado para limitar el consumo
     */
    RAGAnswerDomain query(RAGQueryDomain query, String clientAddress);
}
