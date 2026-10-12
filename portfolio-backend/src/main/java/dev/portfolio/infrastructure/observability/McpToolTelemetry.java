package dev.portfolio.infrastructure.observability;

import dev.portfolio.application.port.out.TelemetryPort;
import dev.portfolio.domain.model.TelemetryEventType;
import dev.portfolio.infrastructure.adapter.in.mcp.McpObserver;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import io.opentelemetry.api.OpenTelemetry;
import io.opentelemetry.api.common.AttributeKey;
import io.opentelemetry.api.trace.Span;
import io.opentelemetry.api.trace.SpanKind;
import io.opentelemetry.api.trace.StatusCode;
import io.opentelemetry.api.trace.Tracer;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.TimeUnit;

/**
 * Lo que se observa de cada llamada a una herramienta MCP, por tres caminos y siempre lo mismo:
 * qué herramienta, cómo acabó y cuánto tardó. Nunca los argumentos ni el resultado.
 * <ul>
 *   <li><b>Métricas</b> (Micrometer): {@code mcp.server.operation.duration}, el histograma que
 *   definen las convenciones semánticas de OpenTelemetry para MCP, y un contador por resultado.</li>
 *   <li><b>Traza</b> (API de OpenTelemetry): un span {@code tools/call <herramienta>} de tipo
 *   SERVER con los atributos de esas convenciones ({@code mcp.method.name},
 *   {@code gen_ai.tool.name}, {@code gen_ai.operation.name = execute_tool}…). Las convenciones
 *   están en estado «Development»: los nombres pueden cambiar.</li>
 *   <li><b>Evento</b> anónimo por el canal de telemetría de la plataforma (SSE).</li>
 * </ul>
 */
public class McpToolTelemetry implements McpObserver {

    public static final String DURATION = "mcp.server.operation.duration";
    public static final String CALLS = "mcp.tool.calls";
    static final String TOOLS_CALL = "tools/call";
    /** Revisión del protocolo que sirve el servidor. */
    static final String PROTOCOL_VERSION = "2025-11-25";
    /** Cortes del histograma que recomiendan las convenciones, en segundos. */
    private static final double[] BUCKETS = {0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 30, 60, 120, 300};

    private static final AttributeKey<String> METHOD = AttributeKey.stringKey("mcp.method.name");
    private static final AttributeKey<String> TOOL = AttributeKey.stringKey("gen_ai.tool.name");
    private static final AttributeKey<String> OPERATION = AttributeKey.stringKey("gen_ai.operation.name");
    private static final AttributeKey<String> ERROR_TYPE = AttributeKey.stringKey("error.type");
    private static final AttributeKey<String> PROTOCOL = AttributeKey.stringKey("mcp.protocol.version");
    private static final AttributeKey<String> SESSION = AttributeKey.stringKey("mcp.session.id");
    private static final AttributeKey<String> TRANSPORT = AttributeKey.stringKey("network.transport");
    private static final AttributeKey<String> NETWORK_PROTOCOL = AttributeKey.stringKey("network.protocol.name");

    private final MeterRegistry meters;
    private final Tracer tracer;
    private final TelemetryPort telemetry;
    private final Clock clock;

    public McpToolTelemetry(MeterRegistry meters, OpenTelemetry openTelemetry, TelemetryPort telemetry, Clock clock) {
        this.meters = meters;
        this.tracer = openTelemetry.getTracer("dev.portfolio.mcp");
        this.telemetry = telemetry;
        this.clock = clock;
    }

    @Override
    public void toolCalled(ToolCall call) {
        // Observar no puede romper lo observado: cada camino falla por su cuenta y en silencio.
        quietly(() -> record(call));
        quietly(() -> trace(call));
        quietly(() -> telemetry.publish(TelemetryEventType.MCP_TOOL_CALL,
                "tool=%s outcome=%s latencyMs=%d".formatted(call.tool(), call.outcome(), call.latency().toMillis())));
    }

    private void record(ToolCall call) {
        Timer.Builder timer = Timer.builder(DURATION)
                .description("Duración de una petición MCP vista desde el servidor")
                .tag(METHOD.getKey(), TOOLS_CALL)
                .tag(TOOL.getKey(), call.tool())
                // Con percentiles calculados aquí: el estado público del servidor enseña la p95 sin otro sistema.
                .publishPercentiles(0.5, 0.95)
                .serviceLevelObjectives(java.util.Arrays.stream(BUCKETS).mapToObj(seconds -> Duration.ofNanos((long) (seconds * 1_000_000_000L))).toArray(Duration[]::new));
        timer.tag(ERROR_TYPE.getKey(), call.failed() ? errorType(call) : "none")
                .register(meters).record(call.latency().toNanos(), TimeUnit.NANOSECONDS);
        Counter.builder(CALLS).description("Llamadas a herramientas MCP, por resultado")
                .tag("tool", call.tool()).tag("outcome", call.outcome()).register(meters).increment();
    }

    private void trace(ToolCall call) {
        Instant end = clock.instant();
        Span span = tracer.spanBuilder(TOOLS_CALL + " " + call.tool())
                .setSpanKind(SpanKind.SERVER)
                .setStartTimestamp(end.minus(call.latency()))
                .setAttribute(METHOD, TOOLS_CALL)
                .setAttribute(TOOL, call.tool())
                .setAttribute(OPERATION, "execute_tool")
                .setAttribute(PROTOCOL, PROTOCOL_VERSION)
                .setAttribute(TRANSPORT, "tcp")
                .setAttribute(NETWORK_PROTOCOL, "http")
                .startSpan();
        if (call.sessionId() != null) {
            span.setAttribute(SESSION, call.sessionId());
        }
        if (call.failed()) {
            span.setAttribute(ERROR_TYPE, errorType(call));
            span.setStatus(StatusCode.ERROR, call.outcome());
        }
        span.end(end);
    }

    /** Una herramienta que responde con {@code isError} es un {@code tool_error}, según las convenciones. */
    private static String errorType(ToolCall call) {
        return "tool_error";
    }

    private static void quietly(Runnable action) {
        try {
            action.run();
        } catch (RuntimeException ignored) {
            // Sin métrica, traza o evento, la llamada ya se atendió.
        }
    }
}
