package dev.portfolio.application.port.in;

import dev.portfolio.domain.model.FeatureFlagChangeDomain;
import dev.portfolio.domain.model.FeatureFlagDomain;
import dev.portfolio.domain.model.FeatureFlagStateDomain;

import java.util.List;
import java.util.Set;

public interface FeatureFlagUseCase {

    /** Flags encendidas. Es la lectura frecuente: va por la caché. */
    Set<FeatureFlagDomain> enabled();

    /** Todas las flags conocidas con su estado y quién las cambió, leídas de la base de datos. */
    List<FeatureFlagStateDomain> findAll();

    /** Enciende o apaga una flag y lo anota en la auditoría. Sin cambio de estado no anota nada. */
    FeatureFlagStateDomain set(String key, boolean enabled, String actor);

    /** Últimos cambios, del más reciente al más antiguo. */
    List<FeatureFlagChangeDomain> audit();
}
