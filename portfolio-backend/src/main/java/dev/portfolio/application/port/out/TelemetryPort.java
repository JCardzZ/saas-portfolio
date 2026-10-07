package dev.portfolio.application.port.out;

import dev.portfolio.domain.model.TelemetryEventType;

import java.util.UUID;

/**
 * Publica eventos de telemetría. Es best-effort: las implementaciones no deben lanzar,
 * porque un fallo al observar el sistema no puede romper la operación observada.
 * Los eventos acaban en un canal público: {@code details} no debe contener datos sensibles.
 */
public interface TelemetryPort {

    void publish(TelemetryEventType type, String details, String traceId);

    default void publish(TelemetryEventType type, String details) {
        publish(type, details, UUID.randomUUID().toString());
    }
}
