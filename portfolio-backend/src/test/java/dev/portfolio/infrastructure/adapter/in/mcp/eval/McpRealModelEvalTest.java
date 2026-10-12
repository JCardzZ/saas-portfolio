package dev.portfolio.infrastructure.adapter.in.mcp.eval;

import dev.portfolio.infrastructure.adapter.in.mcp.McpObserver;
import dev.portfolio.infrastructure.adapter.in.mcp.eval.McpEval.Report;
import dev.portfolio.infrastructure.adapter.in.mcp.eval.McpEval.Task;
import dev.portfolio.testsupport.McpTestServer;
import io.modelcontextprotocol.client.McpSyncClient;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

import java.nio.file.Path;
import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * La evaluación nocturna: las mismas tareas, resueltas por un modelo real. Solo corre si están
 * {@code MCP_EVAL_REAL=true} y {@code GEMINI_API_KEY}; en un PR nunca.
 * <p>
 * Gasto acotado: como mucho {@link McpEval#MAX_TASKS} tareas y {@link McpEval#MAX_CALLS_PER_TASK}
 * llamadas al modelo por tarea (200 en total). No falla por una tarea mal resuelta (el resultado
 * es la tasa de acierto, que queda en {@code build/reports/mcp-eval/mcp-eval-real.json}); sí
 * falla si no se pudo evaluar nada.
 */
@EnabledIfEnvironmentVariable(named = "MCP_EVAL_REAL", matches = "true")
@EnabledIfEnvironmentVariable(named = "GEMINI_API_KEY", matches = ".+")
class McpRealModelEvalTest {

    @Test
    void aRealModelSolvesTheTasksWithinItsCallBudget() throws Exception {
        String model = System.getenv().getOrDefault("MCP_EVAL_MODEL", "gemini-3.5-flash-lite");
        List<Task> tasks = McpEval.tasks().stream().filter(task -> !task.scriptedOnly()).limit(McpEval.MAX_TASKS).toList();
        GeminiEvalModel gemini = new GeminiEvalModel(System.getenv("GEMINI_API_KEY"), model);

        Report report;
        try (McpTestServer server = new McpTestServer(McpObserver.NONE); McpSyncClient client = server.client()) {
            report = McpEval.run(tasks, gemini, client, false, Instant.now());
        }
        McpEval.write(report, Path.of("build/reports/mcp-eval/mcp-eval-real.json"));

        assertThat(report.total()).isEqualTo(tasks.size()).isLessThanOrEqualTo(McpEval.MAX_TASKS);
        assertThat(gemini.modelCalls()).as("llamadas al modelo").isLessThanOrEqualTo(McpEval.MAX_TASKS * McpEval.MAX_CALLS_PER_TASK);
        assertThat(report.tasks()).as("ninguna tarea se pudo evaluar: revisa la clave y el modelo")
                .anyMatch(result -> result.failures().stream().noneMatch(failure -> failure.startsWith("el modelo falló")));
    }
}
