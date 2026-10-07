package dev.portfolio.domain.model;

import java.time.Instant;

/**
 * Algo que acaba de ocurrir en el sistema. Se retransmite por un canal público, así que
 * {@code details} nunca debe llevar preguntas de usuarios, direcciones, identidades ni credenciales.
 *
 * @param traceId agrupa los eventos de una misma operación
 */
public record SystemTelemetryEvent(Instant timestamp, TelemetryEventType eventType, String details, String traceId) {
}
