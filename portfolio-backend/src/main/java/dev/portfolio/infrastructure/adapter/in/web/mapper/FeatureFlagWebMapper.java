package dev.portfolio.infrastructure.adapter.in.web.mapper;

import dev.portfolio.domain.model.FeatureFlagChangeDomain;
import dev.portfolio.domain.model.FeatureFlagDomain;
import dev.portfolio.domain.model.FeatureFlagStateDomain;
import dev.portfolio.model.FeatureFlag;
import dev.portfolio.model.FeatureFlagAuditEntry;
import dev.portfolio.model.FeatureFlagDetail;
import org.springframework.stereotype.Component;

import java.time.ZoneOffset;
import java.util.Arrays;
import java.util.List;
import java.util.Set;

@Component
public class FeatureFlagWebMapper {

    /** Todas las flags conocidas, encendidas o no: el frontend necesita saber también las apagadas. */
    public List<FeatureFlag> toDto(Set<FeatureFlagDomain> enabled) {
        return Arrays.stream(FeatureFlagDomain.values())
                .map(flag -> new FeatureFlag(flag.key(), enabled.contains(flag), flag.description()))
                .toList();
    }

    public List<FeatureFlagDetail> toDetails(List<FeatureFlagStateDomain> states) {
        return states.stream().map(this::toDetail).toList();
    }

    public FeatureFlagDetail toDetail(FeatureFlagStateDomain state) {
        FeatureFlagDetail detail = new FeatureFlagDetail(state.flag().key(), state.enabled(), state.flag().description());
        if (state.updatedAt() != null) {
            detail.setUpdatedAt(state.updatedAt().atOffset(ZoneOffset.UTC));
            detail.setUpdatedBy(state.updatedBy());
        }
        return detail;
    }

    public List<FeatureFlagAuditEntry> toAudit(List<FeatureFlagChangeDomain> changes) {
        return changes.stream()
                .map(change -> new FeatureFlagAuditEntry(change.flag().key(), change.enabled(), change.previous(),
                        change.actor(), change.changedAt().atOffset(ZoneOffset.UTC)))
                .toList();
    }
}
