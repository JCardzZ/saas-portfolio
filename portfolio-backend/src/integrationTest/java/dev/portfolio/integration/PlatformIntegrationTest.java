package dev.portfolio.integration;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

import com.fasterxml.jackson.databind.JsonNode;

import dev.portfolio.application.port.out.VectorRepositoryPort;
import dev.portfolio.domain.model.EmbeddingDomain;

/**
 * La aplicación completa contra PostgreSQL (con pgvector) y Redis reales, en contenedores.
 * Cubre lo que los tests de rebanada no pueden: que las migraciones de Flyway aplican y casan
 * con las entidades, que el script Lua del limitador funciona en un Redis de verdad, que la
 * caché se llena y se purga, y que la búsqueda por similitud respeta el tenant.
 *
 * Necesita Docker: se ejecuta con {@code ./gradlew integrationTest}, no con {@code test}.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class PlatformIntegrationTest {

    private static final String CLIENT_ID = "admin-ui";
    private static final String CLIENT_SECRET = "s3cret-for-tests";
    private static final int AUTH_ATTEMPTS = 4;

    // Un contenedor por clase, arrancado antes del contexto de Spring; Ryuk los retira al terminar.
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>(
            DockerImageName.parse("pgvector/pgvector:pg16").asCompatibleSubstituteFor("postgres"));
    static final GenericContainer<?> REDIS = new GenericContainer<>(DockerImageName.parse("redis:7-alpine"))
            .withExposedPorts(6379);

    static {
        POSTGRES.start();
        REDIS.start();
    }

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("spring.data.redis.host", REDIS::getHost);
        registry.add("spring.data.redis.port", () -> REDIS.getMappedPort(6379));
        registry.add("security.jwt.secret", () -> "dGVzdC1vbmx5LWhtYWMta2V5LTAxMjM0NTY3ODlhYmNkZWY=");
        registry.add("security.admin-client.id", () -> CLIENT_ID);
        registry.add("security.admin-client.secret", () -> CLIENT_SECRET);
        registry.add("security.rate-limit.auth-token.max-requests", () -> AUTH_ATTEMPTS);
    }

    @LocalServerPort
    int port;
    @Autowired
    TestRestTemplate http;
    @Autowired
    JdbcTemplate jdbc;
    @Autowired
    StringRedisTemplate redis;
    @Autowired
    VectorRepositoryPort vectors;

    @Test
    @Order(1)
    void migrations_apply_and_match_the_entities() {
        // El contexto arrancó: Flyway aplicó todo e Hibernate validó cada entidad contra su tabla.
        Integer applied = jdbc.queryForObject(
                "SELECT count(*) FROM flyway_schema_history WHERE success AND version IS NOT NULL", Integer.class);
        Integer vectorExtension = jdbc.queryForObject(
                "SELECT count(*) FROM pg_extension WHERE extname = 'vector'", Integer.class);

        assertThat(applied).isGreaterThanOrEqualTo(7);
        assertThat(vectorExtension).isEqualTo(1);
    }

    @Test
    @Order(2)
    void health_reports_every_dependency_as_up() {
        ResponseEntity<JsonNode> response = http.getForEntity("/telemetry/health", JsonNode.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody().path("status").asText()).isEqualTo("UP");
        assertThat(response.getBody().path("circuitBreakers").path("aiEngine").asText()).isEqualTo("CLOSED");
    }

    @Test
    @Order(3)
    void seeders_fill_the_studio_templates_and_the_cloud_catalog() {
        JsonNode projects = http.getForObject("/public/architecture/projects", JsonNode.class);
        JsonNode catalog = http.getForObject("/public/architecture/catalog", JsonNode.class);

        assertThat(projects.isArray()).isTrue();
        assertThat(projects).isNotEmpty();
        assertThat(catalog.isArray()).isTrue();
        assertThat(catalog).isNotEmpty();
        // La misma lista, filtrada, es más corta: el filtro por nube llega a la consulta.
        JsonNode aws = http.getForObject("/public/architecture/catalog?provider=aws", JsonNode.class);
        assertThat(aws.size()).isPositive().isLessThan(catalog.size());
    }

    @Test
    @Order(4)
    void admin_write_is_persisted_served_from_cache_and_purged_on_change() {
        assertThat(http.postForEntity("/admin/technologies", technology("Sin token"), JsonNode.class).getStatusCode())
                .isEqualTo(HttpStatus.UNAUTHORIZED);

        HttpHeaders auth = bearer(token());
        ResponseEntity<JsonNode> created = http.exchange("/admin/technologies", HttpMethod.POST,
                new HttpEntity<>(technology("Testcontainers"), auth), JsonNode.class);
        assertThat(created.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        String id = created.getBody().path("id").asText();
        assertThat(id).isNotBlank();

        // Primera lectura: fallo de caché, va a PostgreSQL y deja la lista en Redis.
        assertThat(names(http.getForObject("/public/technologies", JsonNode.class))).contains("Testcontainers");
        assertThat(redis.hasKey("portfolio:technologies:all")).isTrue();
        // Segunda lectura: sale de Redis y dice lo mismo.
        assertThat(names(http.getForObject("/public/technologies", JsonNode.class))).contains("Testcontainers");

        ResponseEntity<Void> deleted = http.exchange("/admin/technologies/" + id, HttpMethod.DELETE,
                new HttpEntity<>(auth), Void.class);
        assertThat(deleted.getStatusCode().is2xxSuccessful()).isTrue();
        assertThat(redis.hasKey("portfolio:technologies:all")).isFalse();
        assertThat(names(http.getForObject("/public/technologies", JsonNode.class))).doesNotContain("Testcontainers");
    }

    @Test
    @Order(4)
    void feature_flags_start_off_and_a_change_is_stored_cached_and_audited() {
        JsonNode initial = http.getForObject("/public/features", JsonNode.class);
        assertThat(initial).isNotEmpty();
        assertThat(initial).allSatisfy(flag -> assertThat(flag.path("enabled").asBoolean()).isFalse());
        // La lectura pública deja en Redis la lista de flags encendidas (vacía).
        assertThat(redis.hasKey("portfolio:feature-flags:enabled")).isTrue();

        assertThat(http.exchange("/admin/features/cloud.oracle", HttpMethod.PUT,
                new HttpEntity<>(Map.of("enabled", true)), JsonNode.class).getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);

        HttpHeaders auth = bearer(token());
        ResponseEntity<JsonNode> changed = http.exchange("/admin/features/cloud.oracle", HttpMethod.PUT,
                new HttpEntity<>(Map.of("enabled", true), auth), JsonNode.class);
        assertThat(changed.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(changed.getBody().path("enabled").asBoolean()).isTrue();
        assertThat(changed.getBody().path("updatedBy").asText()).isNotBlank();
        // El cambio purga la caché: la siguiente lectura ya lo ve.
        assertThat(redis.hasKey("portfolio:feature-flags:enabled")).isFalse();

        JsonNode afterwards = http.getForObject("/public/features", JsonNode.class);
        assertThat(afterwards).filteredOn(flag -> flag.path("enabled").asBoolean())
                .extracting(flag -> flag.path("key").asText()).containsExactly("cloud.oracle");

        JsonNode audit = http.exchange("/admin/features/audit", HttpMethod.GET, new HttpEntity<>(auth), JsonNode.class).getBody();
        assertThat(audit).hasSize(1);
        assertThat(audit.get(0).path("key").asText()).isEqualTo("cloud.oracle");
        assertThat(audit.get(0).path("previous").asBoolean()).isFalse();

        assertThat(http.exchange("/admin/features/does.not-exist", HttpMethod.PUT,
                new HttpEntity<>(Map.of("enabled", true), auth), JsonNode.class).getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);

        // Se deja como estaba: el resto de los tests no depende de esta flag.
        http.exchange("/admin/features/cloud.oracle", HttpMethod.PUT, new HttpEntity<>(Map.of("enabled", false), auth), JsonNode.class);
    }

    @Test
    @Order(5)
    void similarity_search_orders_by_distance_and_never_crosses_tenants() {
        vectors.deleteAllByTenant("tenant-a");
        vectors.deleteAllByTenant("tenant-b");
        vectors.saveAll(List.of(
                embedding("a-near", "tenant-a", 0, axis(0)),
                embedding("a-far", "tenant-a", 1, axis(1)),
                // Idéntico a la consulta, pero de otro tenant: no debe aparecer.
                embedding("b-exact", "tenant-b", 0, axis(0))));

        List<EmbeddingDomain> found = vectors.findMostSimilar("tenant-a", axis(0), 5);

        assertThat(found).extracting(EmbeddingDomain::id).containsExactly("a-near", "a-far");
        assertThat(found).extracting(EmbeddingDomain::tenantId).containsOnly("tenant-a");

        vectors.replaceAllForTenant("tenant-a", List.of(embedding("a-new", "tenant-a", 0, axis(2))));
        assertThat(vectors.findMostSimilar("tenant-a", axis(0), 5)).extracting(EmbeddingDomain::id)
                .containsExactly("a-new");
        assertThat(vectors.findMostSimilar("tenant-b", axis(0), 5)).extracting(EmbeddingDomain::id)
                .containsExactly("b-exact");
    }

    @Test
    @Order(6)
    void login_attempts_are_limited_by_the_lua_script_in_redis() throws Exception {
        // Va el último: agota el cupo de /auth/token para esta dirección.
        // Con el cliente del JDK y no con TestRestTemplate: el de Apache reintenta él solo las
        // respuestas 429 esperando lo que diga Retry-After, y el test nunca llegaría a verlas.
        HttpClient client = HttpClient.newHttpClient();
        HttpRequest attempt = HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/v1/auth/token"))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(
                        "{\"clientId\":\"admin-ui\",\"clientSecret\":\"wrong-secret\",\"grantType\":\"client_credentials\"}"))
                .build();

        List<Integer> statuses = new ArrayList<>();
        HttpResponse<String> limited = null;
        // El token del test anterior ya gastó un intento: con AUTH_ATTEMPTS más, alguno tiene que pasarse.
        for (int i = 0; i < AUTH_ATTEMPTS && limited == null; i++) {
            HttpResponse<String> response = client.send(attempt, HttpResponse.BodyHandlers.ofString());
            statuses.add(response.statusCode());
            if (response.statusCode() == HttpStatus.TOO_MANY_REQUESTS.value()) {
                limited = response;
            }
        }

        assertThat(limited)
                .as("ningún intento fue limitado; estados recibidos: %s; contadores en Redis: %s", statuses, rateLimitKeys())
                .isNotNull();
        // Antes de agotar el cupo, las credenciales malas se rechazan como tales.
        assertThat(statuses).as("estados recibidos").contains(HttpStatus.UNAUTHORIZED.value());
        assertThat(limited.headers().firstValue("Retry-After")).isPresent();
        assertThat(limited.headers().firstValue("X-RateLimit-Limit")).contains(String.valueOf(AUTH_ATTEMPTS));
        // El cuerpo es un ProblemDetail (RFC 7807); el contrato lo declara como application/json.
        assertThat(limited.headers().firstValue("Content-Type").orElse("")).startsWith("application/json");
        assertThat(limited.body()).contains("\"status\":429");
    }

    /** Estado del limitador en Redis, para entender un fallo: clave = valor (ms que le quedan). */
    private List<String> rateLimitKeys() {
        List<String> state = new ArrayList<>();
        for (String key : redis.keys("portfolio:ratelimit:*")) {
            state.add(key + " = " + redis.opsForValue().get(key) + " (" + redis.getExpire(key, java.util.concurrent.TimeUnit.MILLISECONDS) + " ms)");
        }
        return state;
    }

    private String token() {
        ResponseEntity<JsonNode> response = http.postForEntity("/auth/token", credentials(CLIENT_SECRET), JsonNode.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        return response.getBody().path("accessToken").asText();
    }

    private static Map<String, String> credentials(String secret) {
        return Map.of("clientId", CLIENT_ID, "clientSecret", secret, "grantType", "client_credentials");
    }

    private static HttpHeaders bearer(String token) {
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(token);
        headers.setContentType(MediaType.APPLICATION_JSON);
        return headers;
    }

    private static Map<String, Object> technology(String name) {
        return Map.of("name", name, "category", "Testing", "proficiencyLevel", "Expert",
                "iconUrl", "https://cdn.example.com/icons/testcontainers.svg", "isFeatured", false);
    }

    private static List<String> names(JsonNode list) {
        List<String> names = new ArrayList<>();
        list.forEach(item -> names.add(item.path("name").asText()));
        return names;
    }

    private static EmbeddingDomain embedding(String id, String tenant, int chunk, float[] vector) {
        return new EmbeddingDomain(id, tenant, "integration/source.md", chunk, "contenido " + id, Map.of(), vector);
    }

    /** Vector unitario sobre un eje: dos ejes distintos son ortogonales (distancia coseno 1). */
    private static float[] axis(int index) {
        float[] vector = new float[EmbeddingDomain.DIMENSIONS];
        vector[index] = 1f;
        return vector;
    }
}
