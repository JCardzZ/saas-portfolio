package dev.portfolio.infrastructure.adapter.in.web.flags;

import dev.portfolio.domain.model.FeatureFlagDomain;
import dev.portfolio.application.port.out.FeatureFlags;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.util.List;

/**
 * Registra las rutas que dependen de una flag. Un endpoint que nace detrás de una flag se
 * añade a {@link #GATES}: así no puede quedar accesible con la flag apagada.
 */
@Configuration
@RequiredArgsConstructor
public class FeatureGateConfig implements WebMvcConfigurer {

    static final List<FeatureGate> GATES = List.of(
            new FeatureGate(FeatureFlagDomain.STUDIO_SYSTEM_DESIGN, List.of("/public/architecture/system-design/**")),
            new FeatureGate(FeatureFlagDomain.MCP_SECTION, List.of("/public/mcp/**")));

    // Con ObjectProvider: los tests de una sola capa web cargan esta clase sin el proveedor de
    // flags. Sin proveedor, una ruta con flag queda cerrada (ver FeatureGateInterceptor).
    private final ObjectProvider<FeatureFlags> flags;

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        for (FeatureGate gate : GATES) {
            registry.addInterceptor(new FeatureGateInterceptor(flags::getIfAvailable, gate.flag())).addPathPatterns(gate.pathPatterns());
        }
    }
}
