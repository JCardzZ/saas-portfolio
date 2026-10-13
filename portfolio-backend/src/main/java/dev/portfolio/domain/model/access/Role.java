package dev.portfolio.domain.model.access;

import java.util.Arrays;
import java.util.EnumSet;
import java.util.Optional;
import java.util.Set;

/**
 * Roles de la administración. Un usuario tiene uno, y de él salen sus permisos: el token solo
 * lleva el rol, así que cambiar lo que un rol puede hacer no obliga a emitir tokens nuevos.
 */
public enum Role {
    ADMIN("Puede hacerlo todo, incluido gestionar usuarios y feature flags.", EnumSet.allOf(Permission.class)),
    EDITOR("Escribe el contenido y el Estudio. No gestiona usuarios, flags ni infraestructura.",
            EnumSet.of(Permission.CMS_READ, Permission.CMS_WRITE, Permission.STUDIO_WRITE, Permission.PROFILE_WRITE,
                    Permission.AI_REINDEX, Permission.FLAGS_READ, Permission.ANALYTICS_READ)),
    VIEWER("Solo lee la administración.",
            EnumSet.of(Permission.CMS_READ, Permission.FLAGS_READ, Permission.ANALYTICS_READ));

    private static final String AUTHORITY_PREFIX = "ROLE_";

    private final String description;
    private final Set<Permission> permissions;

    Role(String description, Set<Permission> permissions) {
        this.description = description;
        this.permissions = Set.copyOf(permissions);
    }

    public String description() {
        return description;
    }

    public Set<Permission> permissions() {
        return permissions;
    }

    public boolean can(Permission permission) {
        return permissions.contains(permission);
    }

    /** Como viaja en el claim {@code roles} del token: {@code ROLE_EDITOR}. */
    public String authority() {
        return AUTHORITY_PREFIX + name();
    }

    /** El rol de un valor del claim {@code roles}; vacío si no es ninguno conocido. */
    public static Optional<Role> fromAuthority(String authority) {
        return Arrays.stream(values()).filter(role -> role.authority().equals(authority)).findFirst();
    }

    public static Optional<Role> fromName(String name) {
        return Arrays.stream(values()).filter(role -> role.name().equals(name)).findFirst();
    }
}
