package dev.portfolio.application.port.out;

import dev.portfolio.domain.model.FeatureFlagDomain;

/**
 * Pregunta única del resto de la plataforma: ¿está encendido esto? La respuesta la da el
 * proveedor de flags (OpenFeature). Si no puede evaluarla, la flag cuenta como apagada.
 */
public interface FeatureFlags {

    boolean isEnabled(FeatureFlagDomain flag);
}
