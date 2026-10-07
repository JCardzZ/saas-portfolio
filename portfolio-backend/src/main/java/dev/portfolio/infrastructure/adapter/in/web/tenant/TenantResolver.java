package dev.portfolio.infrastructure.adapter.in.web.tenant;

import org.springframework.stereotype.Component;

/**
 * Único punto donde la capa web decide a qué tenant pertenece una petición.
 * Hoy solo existe el tenant por defecto; con multi-tenancy saldrá del token o del dominio.
 */
@Component
public class TenantResolver {

    public static final String DEFAULT_TENANT = "default-tenant";

    public String currentTenantId() {
        return DEFAULT_TENANT;
    }
}
