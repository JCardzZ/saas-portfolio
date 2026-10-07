package dev.portfolio.application.port.in;

import dev.portfolio.domain.model.ArchitectureProjectDomain;
import dev.portfolio.domain.model.CloudProviderDomain;

import java.util.List;
import java.util.Map;

public interface ArchitectureProjectUseCase {

    /** @return las plantillas primero y después los proyectos guardados, del más reciente al más antiguo */
    List<ArchitectureProjectDomain> findAll();

    /** @throws dev.portfolio.domain.exception.ResourceNotFoundException si no existe */
    ArchitectureProjectDomain findById(String id);

    /** @throws dev.portfolio.domain.exception.InvalidRequestException si el borrador no es válido */
    ArchitectureProjectDomain create(Draft draft);

    /**
     * @throws dev.portfolio.domain.exception.ResourceNotFoundException si no existe
     * @throws dev.portfolio.domain.exception.InvalidRequestException   si es una plantilla o el borrador no es válido
     */
    ArchitectureProjectDomain update(String id, Draft draft);

    /** Crea o pone al día una plantilla de la plataforma, con un id fijo. */
    ArchitectureProjectDomain registerPreset(String id, Draft draft);

    record Draft(String title, String description, CloudProviderDomain cloudProvider,
                 List<Map<String, Object>> nodes, List<Map<String, Object>> connections, List<Map<String, Object>> zones) {
    }
}
