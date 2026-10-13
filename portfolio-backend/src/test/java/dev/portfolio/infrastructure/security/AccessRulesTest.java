package dev.portfolio.infrastructure.security;

import dev.portfolio.domain.model.access.Permission;
import dev.portfolio.domain.model.access.Role;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.yaml.snakeyaml.LoaderOptions;
import org.yaml.snakeyaml.Yaml;

import java.io.IOException;
import java.io.Reader;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

class AccessRulesTest {

    private static final Path CONTRACT = Path.of("../portfolio-api-spec/saas-portfolio-v1.openapi.yaml");
    private static final Set<String> METHODS = Set.of("get", "post", "put", "delete", "patch");

    private record Operation(HttpMethod method, String path) {
        @Override
        public String toString() {
            return method + " " + path;
        }
    }

    /** Las operaciones de {@code /admin} que declara el contrato. */
    @SuppressWarnings("unchecked")
    private static List<Operation> adminOperations() throws IOException {
        LoaderOptions options = new LoaderOptions();
        options.setCodePointLimit(10_000_000);
        try (Reader reader = Files.newBufferedReader(CONTRACT)) {
            Map<String, Object> contract = new Yaml(options).load(reader);
            List<Operation> operations = new ArrayList<>();
            ((Map<String, Map<String, Object>>) contract.get("paths")).forEach((path, item) -> {
                if (path.startsWith("/admin")) {
                    item.keySet().stream().filter(METHODS::contains)
                            .forEach(method -> operations.add(new Operation(HttpMethod.valueOf(method.toUpperCase()), path.replaceAll("\\{[^}]+}", "x"))));
                }
            });
            return operations;
        }
    }

    private static boolean allowed(Role role, HttpMethod method, String path) {
        Optional<Permission> needed = AccessRules.permissionFor(method, path);
        return needed.map(role::can).orElse(role == Role.ADMIN);
    }

    @Test
    void everyAdminOperationOfTheContractAsksForAPermission() throws IOException {
        List<Operation> operations = adminOperations();

        assertThat(operations).hasSizeGreaterThan(25);
        assertThat(operations.stream().filter(operation -> AccessRules.permissionFor(operation.method(), operation.path()).isEmpty()))
                .as("operaciones de /admin sin regla en AccessRules").isEmpty();
    }

    @Test
    void theAdministratorReachesEveryAdminOperation() throws IOException {
        assertThat(adminOperations()).allSatisfy(operation -> assertThat(allowed(Role.ADMIN, operation.method(), operation.path())).isTrue());
    }

    @Test
    void theViewerReadsAndNeverWrites() throws IOException {
        assertThat(adminOperations().stream().filter(operation -> allowed(Role.VIEWER, operation.method(), operation.path())))
                .as("lo que puede un VIEWER").isNotEmpty()
                .allSatisfy(operation -> assertThat(operation.method()).isEqualTo(HttpMethod.GET));
        assertThat(allowed(Role.VIEWER, HttpMethod.GET, "/admin/technologies")).isTrue();
        assertThat(allowed(Role.VIEWER, HttpMethod.GET, "/admin/features")).isTrue();
        assertThat(allowed(Role.VIEWER, HttpMethod.GET, "/admin/users")).isFalse();
        assertThat(allowed(Role.VIEWER, HttpMethod.POST, "/admin/technologies")).isFalse();
    }

    @Test
    void theEditorWritesContentAndTheStudioButNotUsersFlagsOrInfrastructure() {
        assertThat(allowed(Role.EDITOR, HttpMethod.POST, "/admin/technologies")).isTrue();
        assertThat(allowed(Role.EDITOR, HttpMethod.DELETE, "/admin/projects/x")).isTrue();
        assertThat(allowed(Role.EDITOR, HttpMethod.POST, "/admin/articles")).isTrue();
        assertThat(allowed(Role.EDITOR, HttpMethod.PUT, "/admin/architecture/projects/x")).isTrue();
        assertThat(allowed(Role.EDITOR, HttpMethod.PUT, "/admin/profile/photo")).isTrue();
        assertThat(allowed(Role.EDITOR, HttpMethod.POST, "/admin/ai/rag/reindex")).isTrue();
        assertThat(allowed(Role.EDITOR, HttpMethod.GET, "/admin/features/audit")).isTrue();

        assertThat(allowed(Role.EDITOR, HttpMethod.PUT, "/admin/features/cloud.oracle")).isFalse();
        assertThat(allowed(Role.EDITOR, HttpMethod.GET, "/admin/users")).isFalse();
        assertThat(allowed(Role.EDITOR, HttpMethod.POST, "/admin/users")).isFalse();
        assertThat(allowed(Role.EDITOR, HttpMethod.GET, "/admin/roles")).isFalse();
        assertThat(allowed(Role.EDITOR, HttpMethod.POST, "/admin/infrastructure/cache/purge")).isFalse();
    }

    @Test
    void anAdminPathWithoutARuleIsClosedToEveryoneButTheAdministrator() {
        assertThat(AccessRules.permissionFor(HttpMethod.GET, "/admin/algo-nuevo")).isEmpty();
        assertThat(allowed(Role.EDITOR, HttpMethod.GET, "/admin/algo-nuevo")).isFalse();
        assertThat(allowed(Role.VIEWER, HttpMethod.GET, "/admin/algo-nuevo")).isFalse();
        assertThat(allowed(Role.ADMIN, HttpMethod.GET, "/admin/algo-nuevo")).isTrue();
    }

    @Test
    void theFirstMatchingRuleDecides() {
        // Leer las flags y cambiarlas son permisos distintos sobre la misma ruta.
        assertThat(AccessRules.permissionFor(HttpMethod.GET, "/admin/features")).contains(Permission.FLAGS_READ);
        assertThat(AccessRules.permissionFor(HttpMethod.PUT, "/admin/features/x")).contains(Permission.FLAGS_WRITE);
        // Los proyectos del Estudio no son el CMS de diagramas, aunque compartan prefijo.
        assertThat(AccessRules.permissionFor(HttpMethod.POST, "/admin/architecture/projects")).contains(Permission.STUDIO_WRITE);
        assertThat(AccessRules.permissionFor(HttpMethod.POST, "/admin/architecture/diagrams")).contains(Permission.CMS_WRITE);
    }
}
