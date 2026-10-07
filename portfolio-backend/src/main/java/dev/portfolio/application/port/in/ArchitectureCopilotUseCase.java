package dev.portfolio.application.port.in;

import dev.portfolio.domain.model.ArchitectureAdviceDomain;
import dev.portfolio.domain.model.CloudProviderDomain;

import java.util.List;
import java.util.Map;

public interface ArchitectureCopilotUseCase {

    /**
     * @param clientAddress origen de la petición, para limitar cuántas hace
     * @throws dev.portfolio.domain.exception.InvalidRequestException        si la pregunta o la topología no son válidas
     * @throws dev.portfolio.domain.exception.RateLimitExceededException     si se ha superado el límite de preguntas
     * @throws dev.portfolio.domain.exception.AiServiceUnavailableException  si el motor de IA no responde
     */
    ArchitectureAdviceDomain advise(Question question, String clientAddress);

    record Question(String tenantId, String prompt, CloudProviderDomain cloudProvider,
                    List<Map<String, Object>> nodes, List<Map<String, Object>> connections) {
    }
}
