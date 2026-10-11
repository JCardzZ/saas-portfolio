package dev.portfolio.application.port.out;

import dev.portfolio.domain.model.FeatureFlagChangeDomain;
import dev.portfolio.domain.model.FeatureFlagStateDomain;

import java.util.List;

public interface FeatureFlagRepositoryPort {

    /** Solo las flags que alguien ha cambiado alguna vez. */
    List<FeatureFlagStateDomain> findAll();

    /** Guarda el estado nuevo y su entrada de auditoría en la misma transacción. */
    FeatureFlagStateDomain save(FeatureFlagChangeDomain change);

    List<FeatureFlagChangeDomain> findRecentChanges(int limit);
}
