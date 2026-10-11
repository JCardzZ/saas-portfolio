package dev.portfolio.domain.model;

import java.time.Instant;

/** Un cambio de una flag, tal como queda en la auditoría. */
public record FeatureFlagChangeDomain(FeatureFlagDomain flag, boolean enabled, boolean previous, String actor, Instant changedAt) {
}
