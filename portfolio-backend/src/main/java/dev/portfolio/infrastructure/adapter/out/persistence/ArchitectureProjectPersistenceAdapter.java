package dev.portfolio.infrastructure.adapter.out.persistence;

import dev.portfolio.domain.model.system.SystemDesignDomain;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.portfolio.application.port.out.ArchitectureProjectRepositoryPort;
import dev.portfolio.domain.model.ArchitectureProjectDomain;
import dev.portfolio.domain.model.CloudProviderDomain;
import dev.portfolio.infrastructure.adapter.out.persistence.entity.ArchitectureProjectEntity;
import dev.portfolio.infrastructure.adapter.out.persistence.repository.ArchitectureProjectJpaRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/** Guarda cada proyecto en una fila; su grafo (nodos, conexiones y zonas) va serializado como JSON. */
@Component
@RequiredArgsConstructor
public class ArchitectureProjectPersistenceAdapter implements ArchitectureProjectRepositoryPort {

    private static final TypeReference<List<Map<String, Object>>> GRAPH = new TypeReference<>() {
    };

    private final ArchitectureProjectJpaRepository repository;
    private final ObjectMapper objectMapper;

    @Override
    @Transactional(readOnly = true)
    public List<ArchitectureProjectDomain> findAll() {
        return repository.findAllByOrderByPresetDescCreatedAtDesc().stream().map(this::toDomain).toList();
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<ArchitectureProjectDomain> findById(String id) {
        return repository.findById(id).map(this::toDomain);
    }

    @Override
    @Transactional
    public ArchitectureProjectDomain save(ArchitectureProjectDomain project) {
        return toDomain(repository.save(ArchitectureProjectEntity.builder()
                .id(project.id())
                .title(project.title())
                .description(project.description())
                .cloudProvider(project.cloudProvider().code())
                .nodesJson(write(project.nodes()))
                .connectionsJson(write(project.connections()))
                .zonesJson(write(project.zones()))
                .systemJson(project.system() == null ? null : writeSystem(project.system()))
                .preset(project.preset())
                .createdAt(project.createdAt())
                .updatedAt(Instant.now())
                .build()));
    }

    private ArchitectureProjectDomain toDomain(ArchitectureProjectEntity entity) {
        return new ArchitectureProjectDomain(entity.getId(), entity.getTitle(), entity.getDescription(),
                CloudProviderDomain.fromCode(entity.getCloudProvider()),
                read(entity.getNodesJson()), read(entity.getConnectionsJson()), read(entity.getZonesJson()),
                entity.getSystemJson() == null ? null : readSystem(entity.getSystemJson()),
                entity.isPreset(), entity.getCreatedAt());
    }

    private String write(List<Map<String, Object>> graph) {
        try {
            return objectMapper.writeValueAsString(graph);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("No se pudo serializar el grafo del proyecto", e);
        }
    }

    private String writeSystem(SystemDesignDomain system) {
        try {
            return objectMapper.writeValueAsString(system);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("No se pudo serializar el diseño de sistema del proyecto", e);
        }
    }

    private SystemDesignDomain readSystem(String json) {
        try {
            return objectMapper.readValue(json, SystemDesignDomain.class);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("El diseño de sistema guardado del proyecto no es un JSON válido", e);
        }
    }

    private List<Map<String, Object>> read(String json) {
        try {
            return objectMapper.readValue(json, GRAPH);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("El grafo guardado del proyecto no es un JSON válido", e);
        }
    }
}
