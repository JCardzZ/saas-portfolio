package dev.portfolio.infrastructure.adapter.out.persistence;

import dev.portfolio.application.port.out.FeatureFlagRepositoryPort;
import dev.portfolio.domain.model.FeatureFlagChangeDomain;
import dev.portfolio.domain.model.FeatureFlagDomain;
import dev.portfolio.domain.model.FeatureFlagStateDomain;
import dev.portfolio.infrastructure.adapter.out.persistence.entity.FeatureFlagAuditEntity;
import dev.portfolio.infrastructure.adapter.out.persistence.entity.FeatureFlagEntity;
import dev.portfolio.infrastructure.adapter.out.persistence.repository.FeatureFlagAuditJpaRepository;
import dev.portfolio.infrastructure.adapter.out.persistence.repository.FeatureFlagJpaRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Component
@RequiredArgsConstructor
public class FeatureFlagPersistenceAdapter implements FeatureFlagRepositoryPort {

    // Hoy solo existe este tenant; con multi-tenancy llegará como parámetro del puerto.
    static final String TENANT = "default-tenant";

    private final FeatureFlagJpaRepository flags;
    private final FeatureFlagAuditJpaRepository audit;

    // Una fila de una flag que el código ya no declara se ignora, aquí y en la auditoría.
    @Override
    @Transactional(readOnly = true)
    public List<FeatureFlagStateDomain> findAll() {
        return flags.findAllByTenantId(TENANT).stream()
                .flatMap(entity -> FeatureFlagDomain.fromKey(entity.getFlagKey()).stream()
                        .map(flag -> new FeatureFlagStateDomain(flag, entity.isEnabled(), entity.getUpdatedAt(), entity.getUpdatedBy())))
                .toList();
    }

    @Override
    @Transactional
    public FeatureFlagStateDomain save(FeatureFlagChangeDomain change) {
        String key = change.flag().key();
        flags.save(FeatureFlagEntity.builder()
                .id(TENANT + ":" + key)
                .tenantId(TENANT)
                .flagKey(key)
                .enabled(change.enabled())
                .updatedAt(change.changedAt())
                .updatedBy(change.actor())
                .build());
        audit.save(FeatureFlagAuditEntity.builder()
                .tenantId(TENANT)
                .flagKey(key)
                .enabled(change.enabled())
                .previous(change.previous())
                .actor(change.actor())
                .changedAt(change.changedAt())
                .build());
        return new FeatureFlagStateDomain(change.flag(), change.enabled(), change.changedAt(), change.actor());
    }

    @Override
    @Transactional(readOnly = true)
    public List<FeatureFlagChangeDomain> findRecentChanges(int limit) {
        return audit.findAllByTenantIdOrderByChangedAtDescIdDesc(TENANT, PageRequest.of(0, limit)).stream()
                .flatMap(entity -> FeatureFlagDomain.fromKey(entity.getFlagKey()).stream()
                        .map(flag -> new FeatureFlagChangeDomain(flag, entity.isEnabled(), entity.isPrevious(), entity.getActor(), entity.getChangedAt())))
                .toList();
    }
}
