package dev.portfolio.domain.model;

import java.util.Arrays;
import java.util.Optional;

/**
 * Las feature flags que conoce la plataforma. Todo lo nuevo se integra apagado y se enciende
 * desde la administración, sin desplegar. Una flag que nadie ha cambiado está apagada.
 */
public enum FeatureFlagDomain {

    STUDIO_SMART_RULES("studio.smart-rules", "Lienzo responsivo y conexiones inteligentes en el Estudio de arquitectura"),
    CLOUD_ORACLE("cloud.oracle", "Oracle Cloud como cuarta nube del Estudio"),
    STUDIO_SYSTEM_DESIGN("studio.system-design", "Diseño de sistemas completos: vistas de aplicación e infraestructura"),
    STUDIO_SYSTEM_TEMPLATES("studio.system-templates", "Plantillas de sistemas completos"),
    MCP_SECTION("mcp.section", "Servidor MCP y la sección «Usa mi plataforma desde tu IA»"),
    SITE_RELEASE_VERSION("site.release-version", "Versión desplegada y novedades en el pie de página"),
    SITE_REFRESH("site.refresh", "Rediseño de la portada: hero con pruebas en vivo, fondo limpio y menos cajas"),
    SITE_ADR("site.adr", "Página de decisiones de arquitectura (ADR) y su enlace en la portada"),
    STUDIO_APP_E2E("studio.app-e2e", "Vista de Aplicación de punta a punta: recorrido de una petición y decisiones como filas"),
    STUDIO_APP_CANVAS("studio.app-canvas", "Estudio de Aplicación: lienzo libre con piezas por capas y conexiones con protocolo"),
    ADMIN_REDESIGN("admin.redesign", "Panel de administración rediseñado: barra lateral, tema oscuro e interruptores");

    private final String key;
    private final String description;

    FeatureFlagDomain(String key, String description) {
        this.key = key;
        this.description = description;
    }

    public String key() {
        return key;
    }

    public String description() {
        return description;
    }

    public static Optional<FeatureFlagDomain> fromKey(String key) {
        return Arrays.stream(values()).filter(flag -> flag.key.equals(key)).findFirst();
    }
}
