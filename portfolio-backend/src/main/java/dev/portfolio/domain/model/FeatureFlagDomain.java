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
    MCP_SECTION("mcp.section", "Servidor MCP y la sección «Usa mi plataforma desde tu IA»");

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
