package dev.portfolio.infrastructure.adapter.in.web.sse;

import dev.portfolio.domain.exception.SystemUnavailableException;
import dev.portfolio.domain.model.SystemTelemetryEvent;
import dev.portfolio.domain.model.TelemetryEventType;
import dev.portfolio.infrastructure.adapter.in.web.mapper.TelemetryWebMapperImpl;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.awaitility.Awaitility.await;

class TelemetryStreamBroadcasterTest {

    private static final SystemTelemetryEvent EVENT = new SystemTelemetryEvent(
            Instant.parse("2026-10-05T10:00:00Z"), TelemetryEventType.VECTOR_SEARCH, "5 fragmentos · 12 ms", "trace-1");

    private final Deque<SseEmitter> nextEmitters = new ArrayDeque<>();
    private final TelemetryStreamBroadcaster broadcaster =
            new TelemetryStreamBroadcaster(new TelemetryWebMapperImpl(), 2, nextEmitters::pop);

    @AfterEach
    void tearDown() {
        broadcaster.shutdown();
    }

    /** Emisor que registra lo enviado; con {@code gone} simula un cliente que cerró la conexión. */
    private static class RecordingEmitter extends SseEmitter {
        final List<String> sent = new CopyOnWriteArrayList<>();
        volatile boolean gone;

        @Override
        public void send(SseEventBuilder builder) throws IOException {
            if (gone) {
                throw new IOException("Broken pipe");
            }
            StringBuilder text = new StringBuilder();
            builder.build().forEach(part -> text.append(part.getData()));
            sent.add(text.toString());
        }
    }

    private RecordingEmitter subscribe() {
        RecordingEmitter emitter = new RecordingEmitter();
        nextEmitters.push(emitter);
        assertThat(broadcaster.subscribe()).isSameAs(emitter);
        return emitter;
    }

    @Test
    void greetsEachSubscriberAndDeliversEventsToAllOfThem() {
        RecordingEmitter first = subscribe();
        RecordingEmitter second = subscribe();
        assertThat(first.sent).singleElement().asString().startsWith(":connected");

        broadcaster.onTelemetry(EVENT);

        await().atMost(Duration.ofSeconds(2)).untilAsserted(() -> {
            assertThat(first.sent).hasSize(2);
            assertThat(second.sent).hasSize(2);
        });
        assertThat(first.sent.get(1)).contains("VECTOR_SEARCH").contains("5 fragmentos · 12 ms").contains("trace-1");
    }

    @Test
    void dropsSubscribersWhoseConnectionIsGoneAndKeepsServingTheRest() {
        RecordingEmitter alive = subscribe();
        RecordingEmitter dead = subscribe();
        dead.gone = true;

        broadcaster.onTelemetry(EVENT);

        await().atMost(Duration.ofSeconds(2)).untilAsserted(() -> {
            assertThat(broadcaster.subscriberCount()).isEqualTo(1);
            assertThat(alive.sent).hasSize(2);
        });
    }

    @Test
    void refusesSubscribersBeyondTheLimitAndFreesTheSlotWhenOneLeaves() {
        RecordingEmitter first = subscribe();
        subscribe();

        nextEmitters.push(new RecordingEmitter());
        assertThatThrownBy(broadcaster::subscribe).isInstanceOf(SystemUnavailableException.class);

        first.gone = true;
        broadcaster.onTelemetry(EVENT);
        await().atMost(Duration.ofSeconds(2)).until(() -> broadcaster.subscriberCount() == 1);

        assertThat(broadcaster.subscribe()).isNotNull();
        assertThat(broadcaster.subscriberCount()).isEqualTo(2);
    }

    @Test
    void doesNothingWhenNobodyIsListening() {
        broadcaster.onTelemetry(EVENT);

        assertThat(broadcaster.subscriberCount()).isZero();
    }
}
