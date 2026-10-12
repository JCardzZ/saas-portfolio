package dev.portfolio.application.service;

import dev.portfolio.application.port.in.SystemDesignUseCase.Bundle;
import dev.portfolio.application.port.in.SystemDesignUseCase.GeneratedFile;
import dev.portfolio.application.port.in.SystemDesignUseCase.Request;
import dev.portfolio.application.port.out.RateLimiterPort;
import dev.portfolio.domain.exception.InvalidRequestException;
import dev.portfolio.domain.exception.RateLimitExceededException;
import dev.portfolio.domain.model.CloudProviderDomain;
import dev.portfolio.domain.model.RateLimitDecision;
import dev.portfolio.domain.model.RateLimitPolicy;
import dev.portfolio.domain.model.system.SystemDesignDomain;
import dev.portfolio.domain.model.system.SystemDesignDomain.NonFunctional;
import dev.portfolio.domain.model.system.SystemFindingDomain;
import dev.portfolio.testsupport.SystemDesignFixture;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.yaml.snakeyaml.Yaml;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.mock;

class SystemDesignServiceTest {

    private static final RateLimitPolicy POLICY = new RateLimitPolicy(30, Duration.ofMinutes(1));
    private static final List<Map<String, Object>> NODES = List.of(
            Map.of("id", "static", "type", "static", "zone", "global", "service", Map.of("aws", "S3 + CloudFront"), "terraform", Map.of("aws", "aws_cloudfront_distribution")),
            Map.of("id", "api", "type", "containers", "zone", "compute", "role", "API", "service", Map.of("aws", "ECS Fargate"), "terraform", Map.of("aws", "aws_ecs_service")),
            Map.of("id", "postgres", "type", "postgres", "zone", "data", "role", "Datos", "service", Map.of("aws", "RDS PostgreSQL"), "terraform", Map.of("aws", "aws_db_instance")),
            Map.of("id", "redis", "type", "redis", "zone", "data", "role", "Caché", "name", "Caché | de <b>sesiones</b>", "service", Map.of("aws", "ElastiCache"), "terraform", Map.of("aws", "aws_elasticache_replication_group")));
    private static final List<Map<String, Object>> LINKS = List.of(Map.of("from", "api", "to", "postgres"));

    private final RateLimiterPort rateLimiter = mock(RateLimiterPort.class);
    private final SystemDesignService service = new SystemDesignService(SystemDesignFixture.rules(), rateLimiter, POLICY);

    @BeforeEach
    void allow() {
        given(rateLimiter.tryAcquire(any(), any())).willReturn(new RateLimitDecision(true, 30, 29, Duration.ZERO));
    }

    private static Map<String, String> choices(String... overrides) {
        Map<String, String> choices = new LinkedHashMap<>(Map.of("client", "web-spa", "backend", "spring-boot", "api", "rest", "auth", "jwt-own", "database", "postgresql"));
        for (int index = 0; index < overrides.length; index += 2) {
            choices.put(overrides[index], overrides[index + 1]);
        }
        return choices;
    }

    private static Request request(Map<String, String> choices, Map<String, String> deployments, NonFunctional nfr) {
        return new Request(CloudProviderDomain.AWS, NODES, LINKS, new SystemDesignDomain(choices, deployments, nfr), null);
    }

    private static String file(Bundle bundle, String path) {
        return bundle.files().stream().filter(file -> file.path().equals(path)).findFirst().map(GeneratedFile::content).orElseThrow();
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> yaml(String text) {
        return (Map<String, Object>) new Yaml().load(text);
    }

    @Test
    void generatesTheStartingFilesOfARestSystem() {
        Bundle bundle = service.generate(request(choices(), Map.of("client", "static", "backend", "api", "database", "postgres"), null), "1.2.3.4");

        assertThat(bundle.files()).extracting(GeneratedFile::path, GeneratedFile::language).containsExactly(
                org.assertj.core.groups.Tuple.tuple("main.tf", "hcl"), org.assertj.core.groups.Tuple.tuple("variables.tf", "hcl"),
                org.assertj.core.groups.Tuple.tuple("openapi.yaml", "yaml"), org.assertj.core.groups.Tuple.tuple("docker-compose.yml", "yaml"),
                org.assertj.core.groups.Tuple.tuple("README.md", "markdown"));
        assertThat(bundle.findings()).isEmpty();
        // El Terraform es el mismo que da el generador de siempre para ese lienzo.
        assertThat(file(bundle, "main.tf")).isEqualTo(TerraformGenerator.mainTf(NODES, LINKS, CloudProviderDomain.AWS))
                .contains("resource \"aws_ecs_service\" \"api\"");
    }

    @Test
    @SuppressWarnings("unchecked")
    void writesAnOpenApiContractThatParsesAndCarriesTheChosenAuthentication() {
        Map<String, Object> jwt = yaml(file(service.generate(request(choices(), Map.of(), null), "c"), "openapi.yaml"));

        assertThat(jwt).containsEntry("openapi", "3.0.3").containsKeys("info", "paths", "components");
        assertThat(((Map<String, Object>) jwt.get("paths")).keySet()).containsExactly("/health", "/items", "/items/{id}");
        assertThat((List<Map<String, Object>>) jwt.get("security")).containsExactly(Map.of("bearerAuth", List.of()));
        Map<String, Object> schemes = (Map<String, Object>) ((Map<String, Object>) jwt.get("components")).get("securitySchemes");
        assertThat((Map<String, Object>) schemes.get("bearerAuth")).containsEntry("type", "http").containsEntry("scheme", "bearer");

        Map<String, Object> oidc = yaml(file(service.generate(request(choices("auth", "oidc-managed"), Map.of(), null), "c"), "openapi.yaml"));
        assertThat((Map<String, Object>) ((Map<String, Object>) ((Map<String, Object>) oidc.get("components")).get("securitySchemes")).get("openId"))
                .containsEntry("type", "openIdConnect");
        Map<String, Object> session = yaml(file(service.generate(request(choices("auth", "session"), Map.of(), null), "c"), "openapi.yaml"));
        assertThat((Map<String, Object>) ((Map<String, Object>) ((Map<String, Object>) session.get("components")).get("securitySchemes")).get("sessionCookie"))
                .containsEntry("type", "apiKey").containsEntry("in", "cookie");
    }

    @Test
    void writesAProtoForGrpcAndNoContractForGraphQlOrEvents() {
        Bundle grpc = service.generate(request(choices("api", "grpc"), Map.of(), null), "c");

        assertThat(grpc.files()).extracting(GeneratedFile::path).containsExactly("main.tf", "variables.tf", "service.proto", "docker-compose.yml", "README.md");
        assertThat(file(grpc, "service.proto")).contains("syntax = \"proto3\";", "service ItemService {", "rpc GetItem(GetItemRequest) returns (Item);");
        assertThat(file(grpc, "README.md")).contains("`service.proto`: contrato inicial de la API gRPC");

        for (String style : List.of("graphql", "events")) {
            assertThat(service.generate(request(choices("api", style), Map.of(), null), "c").files()).extracting(GeneratedFile::path)
                    .containsExactly("main.tf", "variables.tf", "docker-compose.yml", "README.md");
        }
    }

    @Test
    @SuppressWarnings("unchecked")
    void composesOnlyTheLocalServicesTheChoicesNeed() {
        Map<String, Object> basic = yaml(file(service.generate(request(choices(), Map.of(), null), "c"), "docker-compose.yml"));
        assertThat(((Map<String, Object>) basic.get("services")).keySet()).containsExactly("database");
        assertThat((Map<String, Object>) ((Map<String, Object>) basic.get("services")).get("database")).containsEntry("image", "postgres:17");

        String full = file(service.generate(request(choices("database", "document", "cache", "redis", "queue", "stream", "auth", "oidc-managed"), Map.of(), null), "c"), "docker-compose.yml");
        Map<String, Object> services = (Map<String, Object>) yaml(full).get("services");
        assertThat(services.keySet()).containsExactly("database", "cache", "stream");
        assertThat(full).contains("image: mongo:8", "image: redis:8", "image: apache/kafka:4.2.2", "# Proveedor de identidad gestionado");

        // Una sesión con cookie necesita su almacén aunque no se haya elegido caché.
        String session = file(service.generate(request(choices("auth", "session", "queue", "queue"), Map.of(), null), "c"), "docker-compose.yml");
        assertThat(((Map<String, Object>) yaml(session).get("services")).keySet()).containsExactly("database", "cache", "queue");

        // Lo que solo existe gestionado no se inventa como contenedor.
        String managed = file(service.generate(request(choices("database", "key-value", "queue", "pubsub", "cache", "cdn"), Map.of(), null), "c"), "docker-compose.yml");
        assertThat(yaml(managed)).containsEntry("services", Map.of());
        assertThat(managed).contains("# Base de datos clave-valor gestionada", "# Publicación y suscripción gestionada", "# Caché en el borde");
    }

    @Test
    void neverWritesAPasswordIntoTheComposeFile() {
        String compose = file(service.generate(request(choices(), Map.of(), null), "c"), "docker-compose.yml");

        assertThat(compose).contains("POSTGRES_PASSWORD: ${DATABASE_PASSWORD:?define DATABASE_PASSWORD en .env}");
    }

    @Test
    void summarisesTheSystemInTheReadmeWithWhatIsStillPending() {
        Bundle bundle = service.generate(request(choices("client", "mobile-cross", "cache", "redis"), Map.of("backend", "api", "cache", "redis"),
                new NonFunctional(null, 800.0, null, 99.9, null, List.of("pci"))), "c");

        String readme = file(bundle, "README.md");
        assertThat(readme).contains(
                "| Cliente | Móvil · multiplataforma (Flutter, React Native) | Se distribuye por las tiendas de aplicaciones, no en la nube. |",
                "| Backend | Java · Spring Boot | ECS Fargate |",
                "| Base de datos | Relacional · PostgreSQL | Sin desplegar |",
                "Nube: AWS. 4 piezas",
                "- Peticiones por segundo en el pico: 800 req/s",
                "- Disponibilidad objetivo: 99.9 %",
                "- Pagos con tarjeta (PCI DSS)",
                "## Pendiente de resolver");
        // El nombre que le puso el visitante a un nodo no abre tablas ni HTML.
        assertThat(readme).contains("| Caché | Redis | Caché \\| de &lt;b&gt;sesiones&lt;/b&gt; |").doesNotContain("<b>");
        assertThat(bundle.findings()).extracting(SystemFindingDomain::rule)
                .contains("deployment-pending", "availability-database", "availability-entry", "pci-waf", "pci-secrets", "pci-audit");
        for (SystemFindingDomain finding : bundle.findings()) {
            assertThat(readme).contains(finding.message().replace("|", "\\|"));
        }
    }

    @Test
    void evaluatesWithTheCostTheCallerEstimates() {
        Request overBudget = new Request(CloudProviderDomain.AWS, NODES, LINKS,
                new SystemDesignDomain(choices(), Map.of("client", "static", "backend", "api", "database", "postgres"), new NonFunctional(null, null, null, null, 50.0, List.of())), 120.4);

        assertThat(service.evaluate(overBudget, "c")).extracting(SystemFindingDomain::rule, SystemFindingDomain::message)
                .containsExactly(org.assertj.core.groups.Tuple.tuple("budget", "El coste estimado (≈ $120 al mes) supera el presupuesto de $50."));
    }

    @Test
    void onlyAcceptsWhatTheCatalogKnows() {
        assertThatThrownBy(() -> service.generate(request(choices("intruso", "x"), Map.of(), null), "c"))
                .isInstanceOf(InvalidRequestException.class).hasMessage("Categoría de sistema desconocida: 'intruso'");
        assertThatThrownBy(() -> service.generate(request(choices("backend", "cobol\n# inyectado"), Map.of(), null), "c"))
                .isInstanceOf(InvalidRequestException.class).hasMessageStartingWith("Opción desconocida en «Backend»");
        assertThatThrownBy(() -> service.evaluate(request(choices(), Map.of("backend", "../../etc"), null), "c"))
                .isInstanceOf(InvalidRequestException.class).hasMessage("«Backend» se despliega en un nodo con un id no válido");
        assertThatThrownBy(() -> service.evaluate(request(choices(), Map.of(), new NonFunctional(null, null, null, null, null, List.of("gdpr"))), "c"))
                .isInstanceOf(InvalidRequestException.class).hasMessage("Regulación desconocida: 'gdpr'");
        assertThatThrownBy(() -> service.evaluate(request(choices(), Map.of(), new NonFunctional(Double.NaN, null, null, null, null, List.of())), "c"))
                .isInstanceOf(InvalidRequestException.class);
        assertThatThrownBy(() -> service.evaluate(new Request(null, NODES, LINKS, new SystemDesignDomain(choices(), Map.of(), null), null), "c"))
                .isInstanceOf(InvalidRequestException.class).hasMessage("El diseño necesita una nube");
        assertThatThrownBy(() -> service.evaluate(new Request(CloudProviderDomain.AWS, NODES, LINKS, null, null), "c"))
                .isInstanceOf(InvalidRequestException.class).hasMessage("Falta el diseño del sistema");
        assertThatThrownBy(() -> service.evaluate(new Request(CloudProviderDomain.AWS, NODES, LINKS, new SystemDesignDomain(choices(), Map.of(), null), -1.0), "c"))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void forgetsWhereSomethingThatIsNotDeployedWas() {
        SystemDesignDomain cleaned = service.validated(new SystemDesignDomain(choices("client", "mobile-native"),
                Map.of("client", "static", "api", "api", "backend", "api", "cache", "redis"), new NonFunctional(1000.0, null, null, null, null, List.of("health", "pci"))));

        assertThat(cleaned.deployments()).containsExactly(Map.entry("backend", "api"));
        // Las regulaciones, en el orden del catálogo.
        assertThat(cleaned.nfr().compliance()).containsExactly("pci", "health");
        assertThat(cleaned.nfr().users()).isEqualTo(1000.0);
    }

    @Test
    void isRateLimitedPerClientLikeTheTerraformGenerator() {
        given(rateLimiter.tryAcquire(eq("system-design:9.9.9.9"), eq(POLICY))).willReturn(new RateLimitDecision(false, 30, 0, Duration.ofSeconds(20)));

        assertThatThrownBy(() -> service.generate(request(choices(), Map.of(), null), "9.9.9.9")).isInstanceOf(RateLimitExceededException.class);
        assertThatThrownBy(() -> service.evaluate(request(choices(), Map.of(), null), "9.9.9.9")).isInstanceOf(RateLimitExceededException.class);
        assertThat(service.evaluate(request(choices(), Map.of("client", "static", "backend", "api", "database", "postgres"), null), "1.1.1.1")).isEmpty();
    }
}
