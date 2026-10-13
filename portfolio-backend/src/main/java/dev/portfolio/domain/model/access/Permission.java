package dev.portfolio.domain.model.access;

/**
 * Lo que se puede hacer en la administración. Cada operación protegida pide uno de estos
 * permisos (qué operación pide cuál lo decide la capa web); los roles los agrupan.
 */
public enum Permission {
    CMS_READ("cms:read", "Ver tecnologías, proyectos y artículos en la administración"),
    CMS_WRITE("cms:write", "Crear, cambiar y borrar tecnologías, proyectos y artículos"),
    STUDIO_WRITE("studio:write", "Guardar proyectos del Estudio de arquitectura"),
    PROFILE_WRITE("profile:write", "Cambiar la foto de perfil del CV"),
    AI_REINDEX("ai:reindex", "Lanzar la reindexación del asistente"),
    FLAGS_READ("flags:read", "Ver las feature flags y su historial"),
    FLAGS_WRITE("flags:write", "Encender y apagar feature flags"),
    ANALYTICS_READ("analytics:read", "Ver las visitas registradas"),
    INFRA_OPERATE("infra:operate", "Operar la infraestructura: despliegues, caché y pruebas de caos"),
    USERS_MANAGE("users:manage", "Crear usuarios y cambiar su rol, su contraseña o su estado");

    private final String code;
    private final String description;

    Permission(String code, String description) {
        this.code = code;
        this.description = description;
    }

    /** Como viaja y se compara: {@code cms:write}. */
    public String code() {
        return code;
    }

    public String description() {
        return description;
    }
}
