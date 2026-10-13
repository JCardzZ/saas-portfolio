package dev.portfolio.infrastructure.adapter.out.persistence;

import dev.portfolio.application.port.out.RefreshTokenRepositoryPort;
import dev.portfolio.application.port.out.UserRepositoryPort;
import dev.portfolio.domain.model.access.RefreshTokenDomain;
import dev.portfolio.domain.model.access.Role;
import dev.portfolio.domain.model.access.StoredUser;
import dev.portfolio.domain.model.access.UserAccountDomain;
import dev.portfolio.infrastructure.adapter.out.persistence.entity.RefreshTokenEntity;
import dev.portfolio.infrastructure.adapter.out.persistence.entity.UserEntity;
import dev.portfolio.infrastructure.adapter.out.persistence.repository.RefreshTokenJpaRepository;
import dev.portfolio.infrastructure.adapter.out.persistence.repository.UserJpaRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

/** Usuarios y tokens de refresco en PostgreSQL. */
@Component
@RequiredArgsConstructor
public class UserPersistenceAdapter implements UserRepositoryPort, RefreshTokenRepositoryPort {

    // Hoy solo existe este tenant; con multi-tenancy llegará como parámetro del puerto.
    static final String TENANT = "default-tenant";

    private final UserJpaRepository users;
    private final RefreshTokenJpaRepository tokens;

    @Override
    @Transactional(readOnly = true)
    public List<UserAccountDomain> findAll() {
        return users.findAllByTenantIdOrderByCreatedAtAsc(TENANT).stream().map(UserPersistenceAdapter::toDomain).toList();
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<UserAccountDomain> findById(String id) {
        return users.findByTenantIdAndId(TENANT, id).map(UserPersistenceAdapter::toDomain);
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<StoredUser> findByEmail(String email) {
        return users.findByTenantIdAndEmail(TENANT, email).map(entity -> new StoredUser(toDomain(entity), entity.getPasswordHash()));
    }

    @Override
    @Transactional(readOnly = true)
    public boolean existsByEmail(String email) {
        return users.existsByTenantIdAndEmail(TENANT, email);
    }

    @Override
    @Transactional(readOnly = true)
    public long count() {
        return users.countByTenantId(TENANT);
    }

    @Override
    @Transactional(readOnly = true)
    public long countActiveAdminsExcept(String exceptId) {
        return users.countByTenantIdAndRoleAndActiveTrueAndIdNot(TENANT, Role.ADMIN.name(), exceptId);
    }

    @Override
    @Transactional
    public UserAccountDomain create(UserAccountDomain account, String passwordHash) {
        return toDomain(users.save(UserEntity.builder()
                .id(account.id()).tenantId(TENANT).email(account.email()).displayName(account.displayName())
                .passwordHash(passwordHash).role(account.role().name()).active(account.active())
                .createdAt(account.createdAt()).updatedAt(account.createdAt())
                .build()));
    }

    @Override
    @Transactional
    public UserAccountDomain update(UserAccountDomain account, String passwordHash) {
        UserEntity entity = users.findByTenantIdAndId(TENANT, account.id()).orElseThrow();
        entity.setDisplayName(account.displayName());
        entity.setRole(account.role().name());
        entity.setActive(account.active());
        entity.setUpdatedAt(Instant.now());
        if (passwordHash != null) {
            entity.setPasswordHash(passwordHash);
        }
        return toDomain(users.save(entity));
    }

    @Override
    @Transactional
    public void save(RefreshTokenDomain token) {
        tokens.save(RefreshTokenEntity.builder()
                .tokenHash(token.tokenHash()).tenantId(TENANT).userId(token.userId())
                .expiresAt(token.expiresAt()).revokedAt(token.revokedAt()).createdAt(Instant.now())
                .build());
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<RefreshTokenDomain> findByHash(String tokenHash) {
        return tokens.findById(tokenHash)
                .map(entity -> new RefreshTokenDomain(entity.getTokenHash(), entity.getUserId(), entity.getExpiresAt(), entity.getRevokedAt()));
    }

    @Override
    @Transactional
    public boolean revoke(String tokenHash, Instant at) {
        return tokens.revoke(tokenHash, at) == 1;
    }

    @Override
    @Transactional
    public void revokeAllOf(String userId, Instant at) {
        tokens.revokeAllOf(userId, at);
    }

    private static UserAccountDomain toDomain(UserEntity entity) {
        return new UserAccountDomain(entity.getId(), entity.getEmail(), entity.getDisplayName(),
                Role.fromName(entity.getRole()).orElse(Role.VIEWER), entity.isActive(), entity.getCreatedAt());
    }
}
