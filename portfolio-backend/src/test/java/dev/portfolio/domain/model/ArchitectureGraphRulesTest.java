package dev.portfolio.domain.model;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.portfolio.domain.exception.InvalidRequestException;
import dev.portfolio.testsupport.GraphRulesFixture;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ArchitectureGraphRulesTest {

    private final ArchitectureGraphRules rules = GraphRulesFixture.load();

    private static Map<String, Object> node(String id, String type) {
        return Map.of("id", id, "type", type);
    }

    private static Map<String, Object> link(String from, String to) {
        return Map.of("from", from, "to", to);
    }

    private static Map<String, Object> link(String from, String to, String kind) {
        return Map.of("from", from, "to", to, "kind", kind);
    }

    @Test
    void loadsTheRulesTheStudioExports() {
        assertThat(rules.logical()).containsEntry("postgres", "database").containsEntry("cdc", "cdc")
                .containsEntry("streaming", "event-stream").containsEntry("event-stream", "event-stream").doesNotContainKey("containers");
        assertThat(rules.incoming().keySet()).containsExactlyInAnyOrder(
                "database", "global-database", "cdc", "event-stream", "queue", "stream-processing", "data-warehouse", "bi");
        assertThat(rules.kinds().keySet()).containsExactlyInAnyOrder("CDC_STREAM", "EVENT_BUS", "ANALYTICS_SINK", "REPLICATION");
        assertThat(rules.maxInstances()).containsEntry("cdc", 3).containsEntry("tableau", 1);
    }

    @Test
    void acceptsADataFlowThatFollowsTheRules() {
        List<Map<String, Object>> nodes = List.of(node("api", "containers"), node("db", "postgres"), node("cdc", "cdc"),
                node("dw", "warehouse"), node("panel", "bi"));
        List<Map<String, Object>> links = List.of(link("api", "db"), link("db", "cdc", "CDC_STREAM"), link("cdc", "dw", "CDC_STREAM"),
                link("dw", "panel", "ANALYTICS_SINK"), link("dw", "api"));

        assertThat(rules.violations(nodes, links)).isEmpty();
        assertThatCode(() -> rules.validate(nodes, links)).doesNotThrowAnyException();
    }

    @Test
    void rejectsAConnectionThatIsNotAllowed() {
        List<Map<String, Object>> nodes = List.of(node("api", "containers"), node("cdc-1", "cdc"), node("panel", "tableau"));

        assertThat(rules.violations(nodes, List.of(link("api", "cdc-1"), link("api", "panel")))).containsExactly(
                "Conexión no permitida: api → cdc-1 (un nodo «service» no puede enviar datos a uno «cdc»)",
                "Conexión no permitida: api → panel (un nodo «service» no puede enviar datos a uno «bi»)");
        assertThatThrownBy(() -> rules.validate(nodes, List.of(link("api", "cdc-1"), link("api", "panel"))))
                .isInstanceOf(InvalidRequestException.class)
                .hasMessage("Conexión no permitida: api → cdc-1 (un nodo «service» no puede enviar datos a uno «cdc») (y 1 más)");
    }

    @Test
    void rejectsALinkKindThatDoesNotFitItsEnds() {
        List<Map<String, Object>> nodes = List.of(node("api", "containers"), node("db", "postgres"));

        assertThat(rules.violations(nodes, List.of(link("api", "db", "REPLICATION"))))
                .containsExactly("Tipo de conexión REPLICATION no válido entre api y db");
        // Un tipo que el editor no conoce se descarta al cargar: no es motivo de rechazo.
        assertThat(rules.violations(nodes, List.of(link("api", "db", "TELEPATHY")))).isEmpty();
    }

    @Test
    void rejectsMoreInstancesThanAServiceAdmits() {
        List<Map<String, Object>> nodes = new ArrayList<>(List.of(node("a", "tableau"), node("b", "tableau")));
        for (int index = 0; index < 5; index++) {
            nodes.add(node("api-" + index, "containers"));
        }

        assertThat(rules.violations(nodes, List.of())).containsExactly("Demasiadas instancias de «tableau»: 2 de 1 como máximo");
    }

    @Test
    void ignoresWhatTheEditorWouldDiscard() {
        List<Map<String, Object>> nodes = List.of(node("cdc-1", "cdc"), Map.of("id", "sin-tipo"));
        List<Map<String, Object>> links = List.of(link("fantasma", "cdc-1"), Map.of("from", 7, "to", "cdc-1"), Map.of());

        assertThat(rules.violations(nodes, links)).isEmpty();
    }

    @Test
    void withNoRulesAcceptsEverything() {
        ArchitectureGraphRules none = new ArchitectureGraphRules(null, null, null, null, null, null, null);

        assertThat(none.violations(List.of(node("api", "containers"), node("cdc", "cdc")), List.of(link("api", "cdc")))).isEmpty();
        assertThat(none.diagnostics(List.of(node("api", "containers"), node("cdc", "cdc")), List.of(link("api", "cdc")))).isEmpty();
    }

    private static Map<String, Object> placed(String id, String type, String zone, String service) {
        return Map.of("id", id, "type", type, "zone", zone, "service", service);
    }

    @Test
    void loadsTheExplanationsAndTheAdvisoryRulesTheStudioExports() {
        assertThat(rules.advice().keySet()).isEqualTo(rules.incoming().keySet());
        assertThat(rules.advice().get("bi").suggestion()).isEqualTo("Pon un almacén de datos en medio.");
        assertThat(rules.placement()).extracting(ArchitectureGraphRules.PlacementRule::id).containsExactly("database-in-public-subnet");
        assertThat(rules.exposure()).extracting(ArchitectureGraphRules.ExposureRule::id).containsExactly("internet-to-database");
    }

    @Test
    void diagnosesABrokenConnectionOnItsTargetWithWhatToDoInstead() {
        List<Map<String, Object>> nodes = List.of(placed("api", "containers", "compute", "ECS Fargate"),
                Map.of("id", "flink-1", "type", "stream-processing", "zone", "managed", "service", "Flink", "name", "  Agregador  "));

        assertThat(rules.diagnostics(nodes, List.of(link("api", "flink-1")))).containsExactly(new GraphDiagnosticDomain(
                "flink-1", "connection", GraphDiagnosticDomain.Severity.ERROR,
                "ECS Fargate no puede enviar datos a Agregador. Un procesador de streams consume de un stream, una cola o un CDC, no de una petición.",
                "Pon una cola o un stream de eventos en medio.", "api", "flink-1"));
    }

    @Test
    void warnsAboutADatabaseInAPublicSubnetAndAboutOneReachedFromTheInternet() {
        List<Map<String, Object>> nodes = List.of(placed("users", "users", "outside", "Visitantes"),
                placed("api", "containers", "compute", "ECS Fargate"), placed("postgres", "postgres", "public", "RDS PostgreSQL"));
        List<Map<String, Object>> links = List.of(link("users", "postgres"), link("api", "postgres"));

        // Son avisos: el grafo se puede guardar.
        assertThat(rules.violations(nodes, links)).isEmpty();
        assertThat(rules.diagnostics(nodes, links)).containsExactly(
                new GraphDiagnosticDomain("postgres", "exposure", GraphDiagnosticDomain.Severity.WARNING,
                        "Visitantes llega desde Internet y RDS PostgreSQL es una base de datos: no debe quedar expuesta.",
                        "Pon una API en medio: Visitantes → API → RDS PostgreSQL.", "users", "postgres"),
                new GraphDiagnosticDomain("postgres", "placement", GraphDiagnosticDomain.Severity.WARNING,
                        "Riesgo de seguridad: RDS PostgreSQL está en una subred pública, alcanzable desde Internet.",
                        "Muévela a una subred privada y deja en la pública solo el balanceador o el API gateway.", null, null));
    }

    @Test
    void diagnosesTheInstancesThatAreOneTooManyAndAWrongLinkKind() {
        List<Map<String, Object>> nodes = List.of(node("tableau-1", "tableau"), node("tableau-2", "tableau"),
                node("api", "containers"), node("queue-1", "queue"));

        List<GraphDiagnosticDomain> found = rules.diagnostics(nodes, List.of(link("api", "queue-1", "REPLICATION")));

        assertThat(found).extracting(GraphDiagnosticDomain::rule, GraphDiagnosticDomain::nodeId, GraphDiagnosticDomain::severity)
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple("link-kind", "queue-1", GraphDiagnosticDomain.Severity.ERROR),
                        org.assertj.core.groups.Tuple.tuple("max-instances", "tableau-2", GraphDiagnosticDomain.Severity.ERROR));
    }

    /** Un error en los diagnósticos es exactamente un grafo que no se puede guardar. */
    @Test
    void reportsAnErrorExactlyWhenTheGraphCannotBeSaved() {
        List<Map<String, Object>> nodes = List.of(node("api", "containers"), node("cdc-1", "cdc"), node("postgres", "postgres"));
        for (List<Map<String, Object>> links : List.of(List.of(link("api", "cdc-1")), List.of(link("postgres", "cdc-1")),
                List.of(link("api", "postgres", "REPLICATION")), List.<Map<String, Object>>of())) {
            boolean hasError = rules.diagnostics(nodes, links).stream().anyMatch(found -> found.severity() == GraphDiagnosticDomain.Severity.ERROR);
            assertThat(hasError).as("%s", links).isEqualTo(!rules.violations(nodes, links).isEmpty());
        }
    }

    /** Ninguna plantilla ni patrón de datos de los que siembra la plataforma arranca incumpliendo una regla. */
    @Test
    void everySeededTemplateFollowsTheRules() throws IOException {
        try (InputStream json = getClass().getResourceAsStream("/architecture/presets.json")) {
            List<Map<String, Object>> presets = new ObjectMapper().readValue(json, new TypeReference<>() {
            });
            assertThat(presets).extracting(preset -> preset.get("id")).contains("cdc-realtime", "event-analytics", "multi-region-recovery");
            for (Map<String, Object> preset : presets) {
                @SuppressWarnings("unchecked")
                List<Map<String, Object>> nodes = (List<Map<String, Object>>) preset.get("nodes");
                @SuppressWarnings("unchecked")
                List<Map<String, Object>> connections = (List<Map<String, Object>>) preset.get("connections");
                assertThat(rules.violations(nodes, connections)).as("%s", preset.get("id")).isEmpty();
                assertThat(rules.diagnostics(nodes, connections)).as("%s", preset.get("id")).isEmpty();
            }
        }
    }
}
