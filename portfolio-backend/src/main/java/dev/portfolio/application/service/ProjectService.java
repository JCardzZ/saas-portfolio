package dev.portfolio.application.service;

import dev.portfolio.application.port.in.ProjectUseCase;
import dev.portfolio.application.port.out.CachePort;
import dev.portfolio.application.port.out.ProjectRepositoryPort;
import dev.portfolio.domain.exception.ResourceNotFoundException;
import dev.portfolio.domain.model.ProjectDomain;

import java.util.List;
import java.util.UUID;

public class ProjectService implements ProjectUseCase {

    private final ProjectRepositoryPort repository;
    private final CachePort cache;

    public ProjectService(ProjectRepositoryPort repository, CachePort cache) {
        this.repository = repository;
        this.cache = cache;
    }

    @Override
    public List<ProjectDomain> findAll() {
        return cache.getList(CacheKeys.PROJECTS_ALL, ProjectDomain.class)
                .orElseGet(() -> {
                    List<ProjectDomain> projects = repository.findAll();
                    cache.put(CacheKeys.PROJECTS_ALL, projects, CacheKeys.TTL);
                    return projects;
                });
    }

    @Override
    public ProjectDomain create(ProjectDomain project) {
        ProjectDomain saved = repository.save(project.withId(UUID.randomUUID().toString()));
        cache.evict(CacheKeys.PROJECTS_ALL);
        return saved;
    }

    @Override
    public ProjectDomain update(String id, ProjectDomain project) {
        requireExists(id);
        ProjectDomain saved = repository.save(project.withId(id));
        cache.evict(CacheKeys.PROJECTS_ALL);
        return saved;
    }

    @Override
    public void delete(String id) {
        requireExists(id);
        repository.deleteById(id);
        cache.evict(CacheKeys.PROJECTS_ALL);
    }

    private void requireExists(String id) {
        if (!repository.existsById(id)) {
            throw new ResourceNotFoundException("Project", id);
        }
    }
}
