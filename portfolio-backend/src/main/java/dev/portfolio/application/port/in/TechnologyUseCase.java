package dev.portfolio.application.port.in;

import dev.portfolio.domain.model.TechnologyDomain;

import java.util.List;

public interface TechnologyUseCase {

    List<TechnologyDomain> findAll();

    TechnologyDomain create(TechnologyDomain technology);

    TechnologyDomain update(String id, TechnologyDomain technology);

    void delete(String id);
}
