package dev.portfolio.infrastructure.adapter.out.persistence.repository;

import dev.portfolio.infrastructure.adapter.out.persistence.entity.FeatureFlagAuditEntity;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface FeatureFlagAuditJpaRepository extends JpaRepository<FeatureFlagAuditEntity, Long> {

    List<FeatureFlagAuditEntity> findAllByTenantIdOrderByChangedAtDescIdDesc(String tenantId, Pageable page);
}
