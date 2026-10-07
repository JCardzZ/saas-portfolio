package dev.portfolio.infrastructure.adapter.out.persistence;

import dev.portfolio.application.port.out.TechnologyRepositoryPort;
import dev.portfolio.domain.model.TechnologyDomain;
import dev.portfolio.infrastructure.adapter.out.persistence.mapper.TechnologyPersistenceMapper;
import dev.portfolio.infrastructure.adapter.out.persistence.repository.TechnologyJpaRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Component
@RequiredArgsConstructor
public class TechnologyPersistenceAdapter implements TechnologyRepositoryPort {

    private final TechnologyJpaRepository repository;
    private final TechnologyPersistenceMapper mapper;

    @Override
    @Transactional(readOnly = true)
    public List<TechnologyDomain> findAll() {
        return mapper.toDomain(repository.findAll());
    }

    @Override
    @Transactional(readOnly = true)
    public boolean existsById(String id) {
        return repository.existsById(id);
    }

    @Override
    @Transactional
    public TechnologyDomain save(TechnologyDomain technology) {
        return mapper.toDomain(repository.save(mapper.toEntity(technology)));
    }

    @Override
    @Transactional
    public void deleteById(String id) {
        repository.deleteById(id);
    }
}
