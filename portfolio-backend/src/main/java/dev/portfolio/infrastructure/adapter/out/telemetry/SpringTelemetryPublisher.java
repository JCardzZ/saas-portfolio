package dev.portfolio.infrastructure.adapter.out.telemetry;

import dev.portfolio.application.port.out.TelemetryPort;
import dev.portfolio.domain.model.SystemTelemetryEvent;
import dev.portfolio.domain.model.TelemetryEventType;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Component;

import java.time.Instant;

/** Publica la telemetría como evento de aplicación de Spring; quien quiera escucharla usa @EventListener. */
@Slf4j
@Component
@RequiredArgsConstructor
public class SpringTelemetryPublisher implements TelemetryPort {

    private final ApplicationEventPublisher publisher;

    @Override
    public void publish(TelemetryEventType type, String details, String traceId) {
        try {
            publisher.publishEvent(new SystemTelemetryEvent(Instant.now(), type, details, traceId));
        } catch (RuntimeException e) {
            // Los listeners son síncronos: su fallo no debe propagarse a la petición que se está midiendo.
            log.warn("Telemetry event {} could not be published: {}", type, e.getMessage());
        }
    }
}
