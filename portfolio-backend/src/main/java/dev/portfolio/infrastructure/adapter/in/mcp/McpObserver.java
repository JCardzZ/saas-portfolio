package dev.portfolio.infrastructure.adapter.in.mcp;

import java.time.Duration;

/**
 * Quien quiere saber que se ha llamado a una herramienta MCP (métricas, trazas, eventos). Solo
 * recibe el nombre de la herramienta, cómo acabó y cuánto tardó: nunca los argumentos ni el
 * resultado.
 */
@FunctionalInterface
public interface McpObserver {

    McpObserver NONE = (tool, outcome, latency) -> { };

    /** @param outcome {@code ok}, {@code invalid_input}, {@code rate_limited} o {@code error} */
    void toolCalled(String tool, String outcome, Duration latency);
}
