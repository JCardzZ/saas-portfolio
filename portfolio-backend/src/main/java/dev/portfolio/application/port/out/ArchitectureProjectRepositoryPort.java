package dev.portfolio.application.port.out;

import dev.portfolio.domain.model.ArchitectureProjectDomain;

import java.util.List;
import java.util.Optional;

public interface ArchitectureProjectRepositoryPort {

    /** @return las plantillas primero y después el resto, del más reciente al más antiguo */
    List<ArchitectureProjectDomain> findAll();

    Optional<ArchitectureProjectDomain> findById(String id);

    ArchitectureProjectDomain save(ArchitectureProjectDomain project);
}
