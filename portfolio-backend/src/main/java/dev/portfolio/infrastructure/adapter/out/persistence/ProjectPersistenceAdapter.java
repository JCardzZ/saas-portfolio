package dev.portfolio.infrastructure.adapter.out.persistence;

import dev.portfolio.application.port.out.ProjectRepositoryPort;
import dev.portfolio.domain.model.ProjectDomain;
import dev.portfolio.infrastructure.adapter.out.persistence.entity.TechnologyEntity;
import dev.portfolio.infrastructure.adapter.out.persistence.mapper.ProjectPersistenceMapper;
import dev.portfolio.infrastructure.adapter.out.persistence.repository.ProjectJpaRepository;
import dev.portfolio.infrastructure.adapter.out.persistence.repository.TechnologyJpaRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

@Component
@RequiredArgsConstructor
public class ProjectPersistenceAdapter implements ProjectRepositoryPort {

    private final ProjectJpaRepository projectRepository;
    private final TechnologyJpaRepository technologyRepository;
    private final ProjectPersistenceMapper mapper;

    @Override
    @Transactional(readOnly = true)
    public List<ProjectDomain> findAll() {
        return mapper.toDomain(projectRepository.findAll());
    }

    @Override
    @Transactional(readOnly = true)
    public boolean existsById(String id) {
        return projectRepository.existsById(id);
    }

    @Override
    @Transactional
    public ProjectDomain save(ProjectDomain project) {
        Set<TechnologyEntity> technologies = new HashSet<>(technologyRepository.findAllById(project.technologyIds()));
        return mapper.toDomain(projectRepository.save(mapper.toEntity(project, technologies)));
    }

    @Override
    @Transactional
    public void deleteById(String id) {
        projectRepository.deleteById(id);
    }
}
