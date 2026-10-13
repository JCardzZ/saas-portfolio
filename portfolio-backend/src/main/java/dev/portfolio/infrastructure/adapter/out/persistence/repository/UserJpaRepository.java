package dev.portfolio.infrastructure.adapter.out.persistence.repository;

import dev.portfolio.infrastructure.adapter.out.persistence.entity.UserEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface UserJpaRepository extends JpaRepository<UserEntity, String> {

    List<UserEntity> findAllByTenantIdOrderByCreatedAtAsc(String tenantId);

    Optional<UserEntity> findByTenantIdAndEmail(String tenantId, String email);

    Optional<UserEntity> findByTenantIdAndId(String tenantId, String id);

    boolean existsByTenantIdAndEmail(String tenantId, String email);

    long countByTenantId(String tenantId);

    long countByTenantIdAndRoleAndActiveTrueAndIdNot(String tenantId, String role, String id);
}
