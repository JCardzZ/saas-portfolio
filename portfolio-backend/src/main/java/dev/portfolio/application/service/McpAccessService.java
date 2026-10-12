package dev.portfolio.application.service;

import dev.portfolio.application.port.in.McpAccessUseCase;
import dev.portfolio.application.port.out.RateLimiterPort;
import dev.portfolio.domain.exception.RateLimitExceededException;
import dev.portfolio.domain.model.RateLimitDecision;
import dev.portfolio.domain.model.RateLimitPolicy;

/**
 * Límite por origen y tope diario global de las llamadas a herramientas MCP. Los contadores van
 * en el mismo limitador que el resto de la plataforma (Redis).
 * <p>
 * El origen es la dirección desde la que llega la conexión. Los clientes que se conectan desde
 * la nube de su proveedor (Claude Desktop con un conector remoto) comparten dirección y, por
 * tanto, cupo.
 */
public class McpAccessService implements McpAccessUseCase {

    private static final String GLOBAL_KEY = "mcp:global";

    private final RateLimiterPort rateLimiter;
    private final RateLimitPolicy perClient;
    private final RateLimitPolicy daily;

    public McpAccessService(RateLimiterPort rateLimiter, RateLimitPolicy perClient, RateLimitPolicy daily) {
        this.rateLimiter = rateLimiter;
        this.perClient = perClient;
        this.daily = daily;
    }

    @Override
    public void admit(String clientKey) {
        // Primero el origen: quien ya ha agotado su cupo no gasta del tope de todos.
        acquire("mcp:" + clientKey, perClient);
        acquire(GLOBAL_KEY, daily);
    }

    @Override
    public Limits limits() {
        return new Limits(perClient.maxRequests(), perClient.window().toSeconds(), daily.maxRequests());
    }

    private void acquire(String key, RateLimitPolicy policy) {
        RateLimitDecision decision = rateLimiter.tryAcquire(key, policy);
        if (!decision.allowed()) {
            throw new RateLimitExceededException(decision.limit(), decision.retryAfter());
        }
    }
}
