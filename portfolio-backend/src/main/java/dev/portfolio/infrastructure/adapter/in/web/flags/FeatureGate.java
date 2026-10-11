package dev.portfolio.infrastructure.adapter.in.web.flags;

import dev.portfolio.domain.model.FeatureFlagDomain;

import java.util.List;

/**
 * Rutas (relativas al context-path, con el patrón de Spring MVC) que solo existen con una flag
 * encendida. Con la flag apagada responden 404, igual que una ruta que no existe.
 */
public record FeatureGate(FeatureFlagDomain flag, List<String> pathPatterns) {
}
