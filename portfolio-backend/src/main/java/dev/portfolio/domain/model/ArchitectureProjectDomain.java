package dev.portfolio.domain.model;

import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * Proyecto del Estudio de arquitectura: una topología para una nube.
 *
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
        boolean preset,
        Instant createdAt
) {
    public static final int MAX_TITLE = 120;
    public static final int MAX_DESCRIPTION = 500;
}
