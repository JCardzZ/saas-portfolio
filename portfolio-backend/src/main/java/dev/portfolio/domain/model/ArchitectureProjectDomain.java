package dev.portfolio.domain.model;

import dev.portfolio.domain.model.system.SystemDesignDomain;
import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * Proyecto del Estudio de arquitectura: una topología para una nube.
 *
 * @param system lo que va encima de la infraestructura (aplicación, despliegues y requisitos); {@code null} si no hay
 * @param preset plantilla que trae la plataforma; no se puede modificar por la API
 */
public record ArchitectureProjectDomain(
        String id,
        String title,
        String description,
        CloudProviderDomain cloudProvider,
        List<Map<String, Object>> nodes,
        List<Map<String, Object>> connections,
        List<Map<String, Object>> zones,
        SystemDesignDomain system,
        boolean preset,
        Instant createdAt
) {
    /** Un proyecto que solo es infraestructura, sin diseño de sistema encima. */
    public ArchitectureProjectDomain(String id, String title, String description, CloudProviderDomain cloudProvider,
                                     List<Map<String, Object>> nodes, List<Map<String, Object>> connections,
                                     List<Map<String, Object>> zones, boolean preset, Instant createdAt) {
        this(id, title, description, cloudProvider, nodes, connections, zones, null, preset, createdAt);
    }

    public static final int MAX_TITLE = 120;
    public static final int MAX_DESCRIPTION = 500;
}
