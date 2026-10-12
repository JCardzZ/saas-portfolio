package dev.portfolio.domain.model;

import java.time.Instant;

/**
 * Estado de una flag.
 *
 * @param updatedAt cuándo se cambió por última vez; {@code null} si nadie la ha cambiado
 * @param updatedBy cliente que la cambió; {@code null} si nadie la ha cambiado
 */
public record FeatureFlagStateDomain(FeatureFlagDomain flag, boolean enabled, Instant updatedAt, String updatedBy) {

    /** Estado de una flag que nadie ha tocado: apagada. */
    public static FeatureFlagStateDomain untouched(FeatureFlagDomain flag) {
        return new FeatureFlagStateDomain(flag, false, null, null);
    }
}
