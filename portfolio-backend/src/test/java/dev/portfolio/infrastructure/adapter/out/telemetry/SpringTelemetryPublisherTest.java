package dev.portfolio.infrastructure.adapter.out.telemetry;

import dev.portfolio.domain.model.SystemTelemetryEvent;
import dev.portfolio.domain.model.TelemetryEventType;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.context.ApplicationEventPublisher;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.willThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class SpringTelemetryPublisherTest {

    private final ApplicationEventPublisher events = mock(ApplicationEventPublisher.class);
    private final SpringTelemetryPublisher publisher = new SpringTelemetryPublisher(events);

    @Test
    void publishesATimestampedApplicationEvent() {
        Instant before = Instant.now();

        publisher.publish(TelemetryEventType.CACHE_HIT, "portfolio:projects:all", "trace-1");

        ArgumentCaptor<SystemTelemetryEvent> event = ArgumentCaptor.captor();
        verify(events).publishEvent(event.capture());
        assertThat(event.getValue().eventType()).isEqualTo(TelemetryEventType.CACHE_HIT);
        assertThat(event.getValue().details()).isEqualTo("portfolio:projects:all");
        assertThat(event.getValue().traceId()).isEqualTo("trace-1");
        assertThat(event.getValue().timestamp()).isBetween(before, Instant.now());
    }

    @Test
    void generatesATraceIdWhenTheCallerHasNone() {
        publisher.publish(TelemetryEventType.JWT_VERIFIED, "ROLE_ADMIN");

        ArgumentCaptor<SystemTelemetryEvent> event = ArgumentCaptor.captor();
        verify(events).publishEvent(event.capture());
        assertThat(event.getValue().traceId()).isNotBlank();
    }

    @Test
    void aFailingListenerNeverBreaksTheOperationBeingObserved() {
        willThrow(new IllegalStateException("listener roto")).given(events).publishEvent(any(Object.class));

        assertThatCode(() -> publisher.publish(TelemetryEventType.RAG_QUERY, "x")).doesNotThrowAnyException();
    }
}
