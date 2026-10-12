package dev.portfolio.infrastructure.adapter.in.mcp.eval;

import dev.portfolio.infrastructure.adapter.in.mcp.McpObserver;
import dev.portfolio.infrastructure.adapter.in.mcp.eval.McpEval.Report;
import dev.portfolio.infrastructure.adapter.in.mcp.eval.McpEval.Task;
import dev.portfolio.infrastructure.adapter.in.mcp.eval.McpEval.TaskResult;
import dev.portfolio.testsupport.McpTestServer;
import io.modelcontextprotocol.client.McpSyncClient;
import org.junit.jupiter.api.Test;

import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * La evaluación del servidor MCP que corre en cada PR: las tareas, resueltas por el modelo
 * simulado, contra el servidor de verdad con un cliente MCP real. Es determinista, así que tiene
 * que pasar entera. Deja el resultado en {@code build/reports/mcp-eval/mcp-eval.json}; con
 * {@code MCP_EVAL_UPDATE=true}, también en {@code docs/mcp/mcp-eval.json}, que es el que enseña la web.
 */
class McpEvalTest {

    @Test
    void theTasksAreSyntheticAndCoverEveryTool() {
        List<Task> tasks = McpEval.tasks();

        assertThat(tasks).hasSizeBetween(20, 30);
        assertThat(tasks).extracting(Task::id).doesNotHaveDuplicates();
        assertThat(tasks.stream().flatMap(task -> task.plan().stream()).map(McpEval.PlannedCall::tool).distinct())
                .containsExactlyInAnyOrder("listar_plantillas", "validar_arquitectura", "generar_terraform", "estimar_costos", "preguntar_portafolio", "disenar_sistema");
        for (Task task : tasks) {
            assertThat(task.plan()).as(task.id()).isNotEmpty().hasSizeLessThanOrEqualTo(McpEval.MAX_CALLS_PER_TASK);
            assertThat(task.expect().tools()).as(task.id()).isNotEmpty();
            // Sin datos personales: ni correos, ni teléfonos, ni nombres de empresas reales en los enunciados.
            assertThat(McpEval.promptOf(task)).as(task.id()).doesNotContainPattern("[\\w.]+@[\\w.]+\\.\\w+").doesNotContainPattern("\\+?\\d{9,}");
            assertThat(McpEval.promptOf(task)).as(task.id()).doesNotContain("{{graph:");
        }
        // Lo que puede evaluar un modelo real cabe en su tope.
        assertThat(tasks.stream().filter(task -> !task.scriptedOnly()).count()).isLessThanOrEqualTo(McpEval.MAX_TASKS);
    }

    @Test
    void theSimulatedModelSolvesEveryTaskAgainstTheRealServer() throws Exception {
        Report report;
        try (McpTestServer server = new McpTestServer(McpObserver.NONE); McpSyncClient client = server.client()) {
            report = McpEval.run(McpEval.tasks(), new McpEval.ScriptedModel(), client, true, Instant.now());
        }
        McpEval.write(report, Path.of("build/reports/mcp-eval/mcp-eval.json"));
        if ("true".equals(System.getenv("MCP_EVAL_UPDATE"))) {
            McpEval.write(report, Path.of("../docs/mcp/mcp-eval.json"));
        }

        assertThat(report.tasks()).filteredOn(result -> !result.passed())
                .as("tareas que no pasan").extracting(result -> result.id() + ": " + result.failures()).isEmpty();
        assertThat(report.passed()).isEqualTo(report.total()).isEqualTo(McpEval.tasks().size());
        assertThat(report.simulated()).isTrue();
        assertThat(report.toolCalls()).isGreaterThanOrEqualTo(report.total());
    }

    @Test
    void aTaskFailsWhenTheModelCallsAForbiddenToolOrMissesTheExpectedOne() throws Exception {
        Task injected = McpEval.tasks().stream().filter(task -> task.id().equals("T27")).findFirst().orElseThrow();
        // Un modelo que obedece el texto del nodo en vez de la tarea.
        McpEval.Model obedient = new McpEval.Model() {
            @Override
            public String name() {
                return "obediente";
            }

            @Override
            public String solve(Task task, List<io.modelcontextprotocol.spec.McpSchema.Tool> tools, McpEval.ToolExecutor executor) {
                return executor.call("generar_terraform", Map.of("$graph", "injected", "nube", "aws")).text();
            }
        };

        try (McpTestServer server = new McpTestServer(McpObserver.NONE); McpSyncClient client = server.client()) {
            TaskResult result = McpEval.run(List.of(injected), obedient, client, true, Instant.now()).tasks().get(0);

            assertThat(result.passed()).isFalse();
            assertThat(result.failures()).anyMatch(failure -> failure.startsWith("no llamó a validar_arquitectura"))
                    .contains("llamó a generar_terraform, que no debía");
        }
    }

    @Test
    void aTaskStopsAtItsCallCap() throws Exception {
        Task any = McpEval.tasks().get(0);
        McpEval.Model greedy = new McpEval.Model() {
            @Override
            public String name() {
                return "insaciable";
            }

            @Override
            public String solve(Task task, List<io.modelcontextprotocol.spec.McpSchema.Tool> tools, McpEval.ToolExecutor executor) {
                while (true) {
                    executor.call("listar_plantillas", Map.of());
                }
            }
        };

        try (McpTestServer server = new McpTestServer(McpObserver.NONE); McpSyncClient client = server.client()) {
            TaskResult result = McpEval.run(List.of(any), greedy, client, true, Instant.now()).tasks().get(0);

            assertThat(result.calls()).isEqualTo(McpEval.MAX_CALLS_PER_TASK);
            assertThat(result.failures()).contains("La tarea ha gastado sus 8 llamadas");
        }
    }
}
