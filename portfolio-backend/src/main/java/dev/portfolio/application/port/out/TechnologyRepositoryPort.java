package dev.portfolio.application.port.out;

import dev.portfolio.domain.model.TechnologyDomain;

import java.util.List;

public interface TechnologyRepositoryPort {

    List<TechnologyDomain> findAll();

    boolean existsById(String id);

    TechnologyDomain save(TechnologyDomain technology);

    void deleteById(String id);
}
