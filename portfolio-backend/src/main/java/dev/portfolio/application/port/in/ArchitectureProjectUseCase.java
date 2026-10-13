package dev.portfolio.application.port.in;

import dev.portfolio.domain.model.ArchitectureProjectDomain;
import dev.portfolio.domain.model.CloudProviderDomain;
import dev.portfolio.domain.model.GraphDiagnosticDomain;
import dev.portfolio.domain.model.system.SystemDesignDomain;

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

    /**
     * Comprueba un grafo que no está guardado: su forma y lo que dicen de él las reglas, nodo a
     * nodo. No depende de ninguna flag ni guarda nada.
     *
     * @param provider nube con cuyos nombres se citan los nodos; {@code null} si no se sabe
     * @throws dev.portfolio.domain.exception.InvalidRequestException si el grafo no tiene la forma de un proyecto
     */
    List<GraphDiagnosticDomain> validate(CloudProviderDomain provider, List<Map<String, Object>> nodes, List<Map<String, Object>> connections);

    /**
     * Lo que las reglas del grafo dicen de un proyecto, nodo a nodo. Vacío mientras la flag
     * {@code studio.smart-rules} esté apagada.
     */
    List<GraphDiagnosticDomain> diagnose(List<Map<String, Object>> nodes, List<Map<String, Object>> connections);

    /** @param system diseño de sistema del proyecto; {@code null} si solo es infraestructura */
    record Draft(String title, String description, CloudProviderDomain cloudProvider,
                 List<Map<String, Object>> nodes, List<Map<String, Object>> connections, List<Map<String, Object>> zones,
                 SystemDesignDomain system) {

        public Draft(String title, String description, CloudProviderDomain cloudProvider,
                     List<Map<String, Object>> nodes, List<Map<String, Object>> connections, List<Map<String, Object>> zones) {
            this(title, description, cloudProvider, nodes, connections, zones, null);
        }
    }
}
