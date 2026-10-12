package dev.portfolio.domain.model.system;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.portfolio.domain.model.CloudProviderDomain;
import dev.portfolio.testsupport.SystemDesignFixture;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class SystemDesignRulesTest {

    private static final ObjectMapper JSON = new ObjectMapper();

    private final SystemDesignRules rules = SystemDesignFixture.rules();

    @Test
    void loadsTheCatalogAndTheRulesTheStudioExports() {
        assertThat(rules.catalog()).extracting(SystemDesignRules.Category::id)
                .containsExactly("client", "backend", "api", "auth", "database", "cache", "queue", "bff", "push");
        assertThat(rules.category("api").orElseThrow().options()).extracting(SystemDesignRules.Option::id, SystemDesignRules.Option::contract)
                .containsExactly(org.assertj.core.groups.Tuple.tuple("rest", "openapi"), org.assertj.core.groups.Tuple.tuple("grpc", "proto"),
                        org.assertj.core.groups.Tuple.tuple("graphql", null), org.assertj.core.groups.Tuple.tuple("events", null));
        assertThat(rules.inputs()).extracting(SystemDesignRules.Input::field).containsExactly("users", "rps", "latencyMs", "availability", "budgetUsd");
        assertThat(rules.rules()).hasSizeGreaterThanOrEqualTo(12);
        assertThat(rules.compliance()).extracting(SystemDesignRules.ComplianceOption::id).containsExactly("pci", "health");
    }

    /** Los casos los evalúa el Estudio y los exporta con su resultado: aquí tiene que salir lo mismo, texto por texto. */
    @Test
    void evaluatesEveryCaseExactlyLikeTheStudio() throws IOException {
        try (InputStream json = getClass().getResourceAsStream("/architecture/system-cases.json")) {
            JsonNode cases = JSON.readTree(json);
            assertThat(cases.size()).isGreaterThanOrEqualTo(10);
            for (JsonNode entry : cases) {
                SystemDesignDomain design = SystemDesignFixture.design(entry.get("design"));
                List<Map<String, Object>> nodes = JSON.convertValue(entry.get("nodes"), JSON.getTypeFactory().constructCollectionType(List.class, Map.class));
                Double cost = entry.get("costUsd").isNull() ? null : entry.get("costUsd").asDouble();

                List<SystemFindingDomain> found = rules.evaluate(design, nodes, cost, CloudProviderDomain.AWS);

                List<String> expected = new ArrayList<>();
                entry.get("findings").forEach(finding -> expected.add(String.join(" | ",
                        finding.get("rule").asText(), finding.get("kind").asText(), finding.get("severity").asText(),
                        text(finding, "category"), text(finding, "nodeId"), finding.get("message").asText(), text(finding, "suggestion"))));
                assertThat(found).as(entry.get("name").asText())
                        .extracting(finding -> String.join(" | ", finding.rule(), finding.kind(), finding.severity().name().toLowerCase(),
                                String.valueOf(finding.category()), String.valueOf(finding.nodeId()), finding.message(), String.valueOf(finding.suggestion())))
                        .containsExactlyElementsOf(expected);
            }
        }
    }

    private static String text(JsonNode node, String field) {
        return node.hasNonNull(field) ? node.get(field).asText() : "null";
    }

    @Test
    void namesANodeByItsOwnNameThenItsServiceInThatCloudThenItsId() {
        assertThat(SystemDesignRules.nameOf(Map.of("id", "api", "name", "  Pagos  ", "service", "ECS"), CloudProviderDomain.AWS)).isEqualTo("Pagos");
        assertThat(SystemDesignRules.nameOf(Map.of("id", "api", "service", Map.of("aws", "ECS Fargate", "gcp", "Cloud Run")), CloudProviderDomain.GCP)).isEqualTo("Cloud Run");
        assertThat(SystemDesignRules.nameOf(Map.of("id", "api", "service", Map.of("aws", "ECS Fargate")), CloudProviderDomain.OCI)).isEqualTo("api");
    }

    @Test
    void writesNumbersLikeTheStudio() {
        assertThat(List.of(SystemDesignRules.plain(3000), SystemDesignRules.plain(99.9), SystemDesignRules.plain(99.95),
                SystemDesignRules.plain(0.5), SystemDesignRules.plain(1_000_000_000))).containsExactly("3000", "99.9", "99.95", "0.5", "1000000000");
    }

    @Test
    void ignoresNodesWithoutAnIdOrAType() {
        SystemDesignDomain design = new SystemDesignDomain(Map.of("client", "mobile-native", "backend", "go", "api", "rest", "auth", "jwt-own", "database", "postgresql"),
                Map.of("backend", "api"), null);
        List<Map<String, Object>> nodes = new ArrayList<>(List.of(Map.of("id", "api"), Map.of("type", "containers"), Map.of("id", 7, "type", "containers")));
        nodes.add(null);

        assertThat(rules.evaluate(design, nodes, null, CloudProviderDomain.AWS)).extracting(SystemFindingDomain::rule, SystemFindingDomain::category)
                .containsExactly(org.assertj.core.groups.Tuple.tuple("deployment-missing", "backend"), org.assertj.core.groups.Tuple.tuple("deployment-pending", "database"));
    }
}
