package dev.portfolio.infrastructure.security;

import dev.portfolio.domain.model.access.Permission;
import org.springframework.http.HttpMethod;
import org.springframework.util.AntPathMatcher;

import java.util.List;
import java.util.Optional;

/**
 * Qué permiso pide cada operación de la administración. Es una tabla, y se evalúa en orden: la
 * primera regla que encaja decide. Una ruta de {@code /admin} que no esté aquí solo la puede
 * usar el rol ADMIN, así que una operación nueva nace cerrada hasta que se le da su regla.
 *
 * Las rutas son relativas al context-path ({@code /v1}).
 */
public final class AccessRules {

    /**
     * @param method  método HTTP, o {@code null} para cualquiera
     * @param pattern patrón de ruta de Spring
     */
    public record Rule(HttpMethod method, String pattern, Permission permission) {
    }

    private static final String[] CMS = {
            "/admin/technologies/**", "/admin/projects/**", "/admin/articles/**", "/admin/media/**", "/admin/architecture/diagrams/**",
    };

    public static final List<Rule> RULES = build();

    private AccessRules() {
    }

    private static final AntPathMatcher MATCHER = new AntPathMatcher();

    /**
     * El permiso que pide una operación: el de la primera regla que encaja. Vacío si ninguna la
     * cubre (entonces, en {@code /admin}, solo entra el rol ADMIN).
     */
    public static Optional<Permission> permissionFor(HttpMethod method, String path) {
        return RULES.stream()
                .filter(rule -> (rule.method() == null || rule.method().equals(method)) && MATCHER.match(rule.pattern(), path))
                .map(Rule::permission).findFirst();
    }

    private static List<Rule> build() {
        var rules = new java.util.ArrayList<Rule>();
        rules.add(new Rule(null, "/admin/users/**", Permission.USERS_MANAGE));
        rules.add(new Rule(null, "/admin/roles", Permission.USERS_MANAGE));
        rules.add(new Rule(HttpMethod.GET, "/admin/features/**", Permission.FLAGS_READ));
        rules.add(new Rule(null, "/admin/features/**", Permission.FLAGS_WRITE));
        rules.add(new Rule(null, "/admin/architecture/projects/**", Permission.STUDIO_WRITE));
        rules.add(new Rule(null, "/admin/ai/**", Permission.AI_REINDEX));
        rules.add(new Rule(null, "/admin/profile/**", Permission.PROFILE_WRITE));
        rules.add(new Rule(null, "/admin/infrastructure/**", Permission.INFRA_OPERATE));
        rules.add(new Rule(HttpMethod.GET, "/admin/recruiter/**", Permission.ANALYTICS_READ));
        for (String pattern : CMS) {
            rules.add(new Rule(HttpMethod.GET, pattern, Permission.CMS_READ));
            rules.add(new Rule(null, pattern, Permission.CMS_WRITE));
        }
        return List.copyOf(rules);
    }
}
