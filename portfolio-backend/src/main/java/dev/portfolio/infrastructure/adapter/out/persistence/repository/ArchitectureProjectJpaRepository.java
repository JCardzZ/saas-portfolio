package dev.portfolio.infrastructure.adapter.out.persistence.repository;

import dev.portfolio.infrastructure.adapter.out.persistence.entity.ArchitectureProjectEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ArchitectureProjectJpaRepository extends JpaRepository<ArchitectureProjectEntity, String> {

    List<ArchitectureProjectEntity> findAllByOrderByPresetDescCreatedAtDesc();
}
