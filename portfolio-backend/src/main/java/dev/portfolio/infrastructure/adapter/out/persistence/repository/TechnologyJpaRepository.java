package dev.portfolio.infrastructure.adapter.out.persistence.repository;

import dev.portfolio.infrastructure.adapter.out.persistence.entity.TechnologyEntity;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TechnologyJpaRepository extends JpaRepository<TechnologyEntity, String> {
}
