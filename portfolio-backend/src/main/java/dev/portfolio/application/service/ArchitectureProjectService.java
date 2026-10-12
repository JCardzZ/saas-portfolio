package dev.portfolio.application.service;

import dev.portfolio.application.port.in.ArchitectureProjectUseCase;
import dev.portfolio.application.port.out.ArchitectureProjectRepositoryPort;
import dev.portfolio.application.port.out.FeatureFlags;
import dev.portfolio.domain.exception.InvalidRequestException;
import dev.portfolio.domain.exception.ResourceNotFoundException;
import dev.portfolio.domain.model.ArchitectureGraph;
import dev.portfolio.domain.model.ArchitectureGraphRules;
import dev.portfolio.domain.model.ArchitectureProjectDomain;
import dev.portfolio.domain.model.FeatureFlagDomain;
import dev.portfolio.domain.model.GraphDiagnosticDomain;
import dev.portfolio.domain.model.system.SystemDesignDomain;
import dev.portfolio.domain.model.system.SystemDesignRules;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public class ArchitectureProjectService implements ArchitectureProjectUseCase {

    private static final String RESOURCE = "ArchitectureProject";

    private final ArchitectureProjectRepositoryPort repository;
    private final ArchitectureGraphRules rules;
    private final FeatureFlags flags;
    private final SystemDesignRules systemRules;

    public ArchitectureProjectService(ArchitectureProjectRepositoryPort repository, ArchitectureGraphRules rules, FeatureFlags flags,
                                      SystemDesignRules systemRules) {
        this.repository = repository;
        this.rules = rules;
        this.flags = flags;
        this.systemRules = systemRules;
    }

    @Override
    public List<GraphDiagnosticDomain> diagnose(List<Map<String, Object>> nodes, List<Map<String, Object>> connections) {
        if (!flags.isEnabled(FeatureFlagDomain.STUDIO_SMART_RULES)) {
            return List.of();
        }
        return rules.diagnostics(nodes == null ? List.of() : nodes, connections == null ? List.of() : connections);
    }

    @Override
    public List<ArchitectureProjectDomain> findAll() {
        return repository.findAll().stream().filter(this::visible).toList();
    }

    /**
     * Los sistemas de ejemplo (plantillas con diseño de sistema) solo existen para quien pregunta
     * con la flag {@code studio.system-templates} encendida. Se siembran igual, para que encenderla
     * no exija desplegar.
     */
    private boolean visible(ArchitectureProjectDomain project) {
        return !(project.preset() && project.system() != null) || flags.isEnabled(FeatureFlagDomain.STUDIO_SYSTEM_TEMPLATES);
    }

    @Override
    public ArchitectureProjectDomain findById(String id) {
        return repository.findById(id).filter(this::visible).orElseThrow(() -> new ResourceNotFoundException(RESOURCE, id));
    }

    @Override
    public ArchitectureProjectDomain create(Draft draft) {
        return repository.save(build(UUID.randomUUID().toString(), draft, false, Instant.now()));
    }

    @Override
    public ArchitectureProjectDomain update(String id, Draft draft) {
        ArchitectureProjectDomain existing = findById(id);
        if (existing.preset()) {
            throw new InvalidRequestException("Las plantillas no se pueden modificar: guarda el proyecto como uno nuevo");
        }
        return repository.save(build(id, draft, false, existing.createdAt()));
    }

    @Override
    public ArchitectureProjectDomain registerPreset(String id, Draft draft) {
        Instant createdAt = repository.findById(id).map(ArchitectureProjectDomain::createdAt).orElseGet(Instant::now);
        return repository.save(build(id, draft, true, createdAt));
    }

    private ArchitectureProjectDomain build(String id, Draft draft, boolean preset, Instant createdAt) {
        if (draft.title() == null || draft.title().isBlank()) {
            throw new InvalidRequestException("El proyecto necesita un título");
        }
        String title = draft.title().strip();
        String description = draft.description() == null || draft.description().isBlank() ? null : draft.description().strip();
        if (title.length() > ArchitectureProjectDomain.MAX_TITLE) {
            throw new InvalidRequestException("El título no puede superar los %d caracteres".formatted(ArchitectureProjectDomain.MAX_TITLE));
        }
        if (description != null && description.length() > ArchitectureProjectDomain.MAX_DESCRIPTION) {
            throw new InvalidRequestException("La descripción no puede superar los %d caracteres".formatted(ArchitectureProjectDomain.MAX_DESCRIPTION));
        }
        if (draft.cloudProvider() == null) {
            throw new InvalidRequestException("El proyecto necesita una nube");
        }
        ArchitectureGraph.validate(draft.nodes(), draft.connections(), draft.zones());
        // El editor solo avisa de estas reglas; lo que se guarda y se sirve a otros debe cumplirlas.
        rules.validate(draft.nodes(), draft.connections());
        // El diseño de sistema, si viene, solo puede nombrar lo que hay en su catálogo.
        SystemDesignDomain system = draft.system() == null ? null : systemRules.validated(draft.system());
        return new ArchitectureProjectDomain(id, title, description, draft.cloudProvider(),
                draft.nodes(), draft.connections(), draft.zones(), system, preset, createdAt);
    }
}
