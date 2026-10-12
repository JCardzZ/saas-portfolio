package dev.portfolio.infrastructure.observability;

import dev.portfolio.application.port.out.TelemetryPort;
import dev.portfolio.domain.model.TelemetryEventType;
import dev.portfolio.infrastructure.adapter.in.mcp.McpObserver.ToolCall;
import io.micrometer.core.instrument.Timer;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import io.opentelemetry.api.common.AttributeKey;
import io.opentelemetry.api.trace.SpanKind;
import io.opentelemetry.api.trace.StatusCode;
import io.opentelemetry.sdk.OpenTelemetrySdk;
import io.opentelemetry.sdk.testing.exporter.InMemorySpanExporter;
import io.opentelemetry.sdk.trace.SdkTracerProvider;
import io.opentelemetry.sdk.trace.data.SpanData;
import io.opentelemetry.sdk.trace.export.SimpleSpanProcessor;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

class McpToolTelemetryTest {

    private static final Instant NOW = Instant.parse("2026-10-12T12:00:00Z");

    private final SimpleMeterRegistry meters = new SimpleMeterRegistry();
    private final InMemorySpanExporter spans = InMemorySpanExporter.create();
    private final OpenTelemetrySdk openTelemetry = OpenTelemetrySdk.builder()
            .setTracerProvider(SdkTracerProvider.builder().addSpanProcessor(SimpleSpanProcessor.create(spans)).build()).build();
    private final List<String> events = new ArrayList<>();
    private final TelemetryPort telemetryPort = new TelemetryPort() {
        @Override
        public void publish(TelemetryEventType type, String details, String traceId) {
            events.add(type + " " + details);
        }
    };
    private final McpToolTelemetry telemetry = new McpToolTelemetry(meters, openTelemetry, telemetryPort, Clock.fixed(NOW, ZoneOffset.UTC));

    private static String attribute(SpanData span, String key) {
        return span.getAttributes().get(AttributeKey.stringKey(key));
    }

    @Test
    void recordsTheDurationHistogramTheMcpConventionsDefine() {
        telemetry.toolCalled(new ToolCall("validar_arquitectura", "ok", Duration.ofMillis(120), "s-1"));
        telemetry.toolCalled(new ToolCall("validar_arquitectura", "ok", Duration.ofMillis(80), "s-1"));
        telemetry.toolCalled(new ToolCall("validar_arquitectura", "invalid_input", Duration.ofMillis(5), "s-2"));

        Timer ok = meters.get("mcp.server.operation.duration").tag("mcp.method.name", "tools/call")
                .tag("gen_ai.tool.name", "validar_arquitectura").tag("error.type", "none").timer();
        assertThat(ok.count()).isEqualTo(2);
        assertThat(ok.totalTime(TimeUnit.MILLISECONDS)).isEqualTo(200);
        assertThat(ok.takeSnapshot().percentileValues()).extracting(value -> value.percentile()).containsExactly(0.5, 0.95);
        assertThat(meters.get("mcp.server.operation.duration").tag("error.type", "tool_error").timer().count()).isEqualTo(1);
        assertThat(meters.get("mcp.tool.calls").tag("tool", "validar_arquitectura").tag("outcome", "ok").counter().count()).isEqualTo(2);
        assertThat(meters.get("mcp.tool.calls").tag("outcome", "invalid_input").counter().count()).isEqualTo(1);
    }

    @Test
    void tracesEachCallAsAServerSpanWithTheGenAiAttributes() {
        telemetry.toolCalled(new ToolCall("generar_terraform", "ok", Duration.ofMillis(250), "sesion-9"));

        SpanData span = spans.getFinishedSpanItems().get(0);
        assertThat(span.getName()).isEqualTo("tools/call generar_terraform");
        assertThat(span.getKind()).isEqualTo(SpanKind.SERVER);
        assertThat(attribute(span, "mcp.method.name")).isEqualTo("tools/call");
        assertThat(attribute(span, "gen_ai.tool.name")).isEqualTo("generar_terraform");
        assertThat(attribute(span, "gen_ai.operation.name")).isEqualTo("execute_tool");
        assertThat(attribute(span, "mcp.protocol.version")).isEqualTo("2025-11-25");
        assertThat(attribute(span, "mcp.session.id")).isEqualTo("sesion-9");
        assertThat(attribute(span, "network.transport")).isEqualTo("tcp");
        assertThat(attribute(span, "error.type")).isNull();
        assertThat(span.getStatus().getStatusCode()).isEqualTo(StatusCode.UNSET);
        // El span dura lo que duró la llamada y acaba cuando se observa.
        assertThat(span.getEndEpochNanos() - span.getStartEpochNanos()).isEqualTo(Duration.ofMillis(250).toNanos());
    }

    @Test
    void marksAToolThatAnswersWithAnErrorAsAToolError() {
        telemetry.toolCalled(new ToolCall("estimar_costos", "rate_limited", Duration.ofMillis(2), null));

        SpanData span = spans.getFinishedSpanItems().get(0);
        assertThat(attribute(span, "error.type")).isEqualTo("tool_error");
        assertThat(span.getStatus().getStatusCode()).isEqualTo(StatusCode.ERROR);
        assertThat(attribute(span, "mcp.session.id")).isNull();
    }

    /** Lo que sale por el canal público de telemetría: herramienta, resultado y latencia. Nada más. */
    @Test
    void publishesAnAnonymousEventWithoutAnyContent() {
        telemetry.toolCalled(new ToolCall("preguntar_portafolio", "ok", Duration.ofMillis(1340), "sesion-secreta"));

        assertThat(events).containsExactly("MCP_TOOL_CALL tool=preguntar_portafolio outcome=ok latencyMs=1340");
        // Ni la sesión viaja por el canal público.
        assertThat(events.get(0)).doesNotContain("sesion-secreta");
        // Y en la traza no hay atributos de contenido (argumentos, resultado), que las convenciones dejan como opcionales.
        assertThat(spans.getFinishedSpanItems().get(0).getAttributes().asMap().keySet()).extracting(AttributeKey::getKey)
                .doesNotContain("gen_ai.tool.call.arguments", "gen_ai.tool.call.result", "client.address");
    }

    @Test
    void neverBreaksTheCallItObserves() {
        TelemetryPort broken = new TelemetryPort() {
            @Override
            public void publish(TelemetryEventType type, String details, String traceId) {
                throw new IllegalStateException("canal caído");
            }
        };
        McpToolTelemetry fragile = new McpToolTelemetry(meters, openTelemetry, broken, Clock.systemUTC());

        assertThatCode(() -> fragile.toolCalled(new ToolCall("listar_plantillas", "ok", Duration.ofMillis(1), "s"))).doesNotThrowAnyException();
        assertThat(meters.get("mcp.tool.calls").counter().count()).isEqualTo(1);
    }
}
