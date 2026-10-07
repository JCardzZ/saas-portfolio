package dev.portfolio.application.service;

import dev.portfolio.application.port.in.TechnologyUseCase;
import dev.portfolio.application.port.out.CachePort;
import dev.portfolio.application.port.out.TechnologyRepositoryPort;
import dev.portfolio.domain.exception.ResourceNotFoundException;
import dev.portfolio.domain.model.TechnologyDomain;

import java.util.List;
import java.util.UUID;

public class TechnologyService implements TechnologyUseCase {

    private final TechnologyRepositoryPort repository;
    private final CachePort cache;

    public TechnologyService(TechnologyRepositoryPort repository, CachePort cache) {
        this.repository = repository;
        this.cache = cache;
    }

    @Override
    public List<TechnologyDomain> findAll() {
        return cache.getList(CacheKeys.TECHNOLOGIES_ALL, TechnologyDomain.class)
                .orElseGet(() -> {
                    List<TechnologyDomain> technologies = repository.findAll();
                    cache.put(CacheKeys.TECHNOLOGIES_ALL, technologies, CacheKeys.TTL);
                    return technologies;
                });
    }

    @Override
    public TechnologyDomain create(TechnologyDomain technology) {
        TechnologyDomain saved = repository.save(technology.withId(UUID.randomUUID().toString()));
        cache.evict(CacheKeys.TECHNOLOGIES_ALL);
        return saved;
    }

    @Override
    public TechnologyDomain update(String id, TechnologyDomain technology) {
        requireExists(id);
        TechnologyDomain saved = repository.save(technology.withId(id));
        cache.evict(CacheKeys.TECHNOLOGIES_ALL);
        return saved;
    }

    @Override
    public void delete(String id) {
        requireExists(id);
        repository.deleteById(id);
        // Borrar una tecnología la desvincula de sus proyectos (ON DELETE CASCADE),
        // así que la lista de proyectos cacheada también queda obsoleta.
        cache.evict(CacheKeys.TECHNOLOGIES_ALL, CacheKeys.PROJECTS_ALL);
    }

    private void requireExists(String id) {
        if (!repository.existsById(id)) {
            throw new ResourceNotFoundException("Technology", id);
        }
    }
}
