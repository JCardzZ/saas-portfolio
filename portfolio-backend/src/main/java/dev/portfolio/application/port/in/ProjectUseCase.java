package dev.portfolio.application.port.in;

import dev.portfolio.domain.model.ProjectDomain;

import java.util.List;

public interface ProjectUseCase {

    List<ProjectDomain> findAll();

    ProjectDomain create(ProjectDomain project);

    ProjectDomain update(String id, ProjectDomain project);

    void delete(String id);
}
