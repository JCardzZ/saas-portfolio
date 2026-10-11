package dev.portfolio.infrastructure.adapter.out.persistence.repository;

import dev.portfolio.infrastructure.adapter.out.persistence.entity.FeatureFlagEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface FeatureFlagJpaRepository extends JpaRepository<FeatureFlagEntity, String> {

    List<FeatureFlagEntity> findAllByTenantId(String tenantId);
}
