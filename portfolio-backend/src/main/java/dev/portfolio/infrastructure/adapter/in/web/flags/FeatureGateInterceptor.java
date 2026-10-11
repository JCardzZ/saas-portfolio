package dev.portfolio.infrastructure.adapter.in.web.flags;

import dev.portfolio.application.port.out.FeatureFlags;
import dev.portfolio.domain.exception.ResourceNotFoundException;
import dev.portfolio.domain.model.FeatureFlagDomain;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.web.servlet.HandlerInterceptor;

import java.util.function.Supplier;

/**
 * Corta con 404 las peticiones a una ruta cuya flag está apagada. Sin proveedor de flags la
 * ruta también queda cerrada: ante la duda, lo nuevo no se sirve.
 */
public class FeatureGateInterceptor implements HandlerInterceptor {

    private final Supplier<FeatureFlags> flags;
    private final FeatureFlagDomain flag;

    public FeatureGateInterceptor(Supplier<FeatureFlags> flags, FeatureFlagDomain flag) {
        this.flags = flags;
        this.flag = flag;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        FeatureFlags provider = flags.get();
        if (provider == null || !provider.isEnabled(flag)) {
            // El mismo 404 que una ruta inexistente: una función apagada no se anuncia.
            throw new ResourceNotFoundException("Recurso", request.getRequestURI());
        }
        return true;
    }
}
