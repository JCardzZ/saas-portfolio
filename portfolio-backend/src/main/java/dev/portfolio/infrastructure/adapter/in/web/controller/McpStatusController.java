package dev.portfolio.infrastructure.adapter.in.web.controller;

import dev.portfolio.api.McpApi;
import dev.portfolio.application.port.in.McpAccessUseCase;
import dev.portfolio.infrastructure.adapter.in.mcp.McpSdkServer;
import dev.portfolio.infrastructure.adapter.in.mcp.McpTool;
import dev.portfolio.infrastructure.observability.McpToolTelemetry;
import dev.portfolio.model.McpStatus;
import dev.portfolio.model.McpStatusLatency;
import dev.portfolio.model.McpStatusLimits;
import dev.portfolio.model.McpStatusServer;
import dev.portfolio.model.McpToolInfo;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;

/**
 * Lo que la web enseña del servidor MCP: qué herramientas publica (las mismas que un cliente
 * recibe de {@code tools/list}), sus límites y la latencia medida. Detrás de la flag
 * {@code mcp.section} (FeatureGateConfig). Nunca expone el contenido de una llamada.
 */
@RestController
@RequiredArgsConstructor
public class McpStatusController implements McpApi {

    private final McpSdkServer server;
    private final McpAccessUseCase access;
    private final McpToolTelemetry telemetry;

    @Override
    public ResponseEntity<McpStatus> publicMcpStatusGet() {
        McpAccessUseCase.Limits limits = access.limits();
        McpToolTelemetry.Latency latency = telemetry.latency();
        return ResponseEntity.ok(new McpStatus()
                .online(true)
                .endpoint(McpSdkServer.ENDPOINT)
                .protocolVersion(McpSdkServer.PROTOCOL_VERSION)
                .server(new McpStatusServer().name(McpSdkServer.SERVER_NAME).version(McpSdkServer.SERVER_VERSION))
                .tools(server.tools().stream().map(tool -> new McpToolInfo()
                        .name(tool.name()).title(tool.title()).description(tool.description())
                        .kind(tool.kind() == McpTool.Kind.READ ? "read" : "generate").version(tool.version())).toList())
                .limits(new McpStatusLimits().perClient(limits.perClient()).windowSeconds((int) limits.perClientWindowSeconds()).dailyTotal(limits.dailyTotal()))
                .latency(new McpStatusLatency().calls((int) latency.calls())
                        .p50Ms(latency.p50Ms() == null ? null : BigDecimal.valueOf(latency.p50Ms()))
                        .p95Ms(latency.p95Ms() == null ? null : BigDecimal.valueOf(latency.p95Ms()))));
    }
}
