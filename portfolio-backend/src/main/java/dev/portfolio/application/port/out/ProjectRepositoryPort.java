package dev.portfolio.application.port.out;

import dev.portfolio.domain.model.ProjectDomain;

import java.util.List;

public interface ProjectRepositoryPort {

    List<ProjectDomain> findAll();

    boolean existsById(String id);

    ProjectDomain save(ProjectDomain project);

    void deleteById(String id);
}
