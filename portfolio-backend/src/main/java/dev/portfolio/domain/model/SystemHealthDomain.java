package dev.portfolio.domain.model;

/**
 * Estado de las dependencias del sistema. La base de datos es imprescindible; la caché y el
 * motor de IA degradan el servicio pero no lo detienen.
 */
public record SystemHealthDomain(ComponentHealth database, ComponentHealth cache, CircuitState aiEngineCircuit) {

    public enum Status { UP, DEGRADED, DOWN }

    public enum CircuitState { CLOSED, HALF_OPEN, OPEN }

    public record ComponentHealth(boolean healthy, String description) {
    }

    public Status status() {
        if (!database.healthy()) {
            return Status.DOWN;
        }
        return cache.healthy() && aiEngineCircuit == CircuitState.CLOSED ? Status.UP : Status.DEGRADED;
    }
}
