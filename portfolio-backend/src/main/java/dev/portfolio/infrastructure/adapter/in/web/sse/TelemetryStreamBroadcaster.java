package dev.portfolio.infrastructure.adapter.in.web.sse;

import dev.portfolio.domain.exception.SystemUnavailableException;
import dev.portfolio.domain.model.SystemTelemetryEvent;
import dev.portfolio.infrastructure.adapter.in.web.mapper.TelemetryWebMapper;
import dev.portfolio.model.TelemetryEvent;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.event.EventListener;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter.SseEventBuilder;

import java.io.IOException;
import java.time.Duration;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Supplier;

/**
 * Retransmite los eventos de telemetría a los clientes conectados por SSE.
 * <p>
 * El envío ocurre en un hilo propio: quien publica el evento (la petición que se está
 * midiendo) nunca espera a un cliente lento. El endpoint es público, así que el número
 * de suscriptores y la cola de envíos están acotados.
 */
@Slf4j
@Component
public class TelemetryStreamBroadcaster {

    static final int MAX_SUBSCRIBERS = 100;
    static final int MAX_PENDING_BROADCASTS = 1_000;
    // Al expirar, el navegador (EventSource) se reconecta solo.
    private static final Duration CONNECTION_TIMEOUT = Duration.ofMinutes(5);
    // Mantiene viva la conexión a través de proxies y detecta clientes que ya se fueron.
    private static final Duration HEARTBEAT_INTERVAL = Duration.ofSeconds(20);

    private final Set<SseEmitter> emitters = ConcurrentHashMap.newKeySet();
    private final AtomicInteger pendingBroadcasts = new AtomicInteger();
    private final ScheduledExecutorService executor;
    private final TelemetryWebMapper mapper;
    private final int maxSubscribers;
    private final Supplier<SseEmitter> emitterFactory;

    @Autowired
    public TelemetryStreamBroadcaster(TelemetryWebMapper mapper) {
        this(mapper, MAX_SUBSCRIBERS, () -> new SseEmitter(CONNECTION_TIMEOUT.toMillis()));
    }

    TelemetryStreamBroadcaster(TelemetryWebMapper mapper, int maxSubscribers, Supplier<SseEmitter> emitterFactory) {
        this.mapper = mapper;
        this.maxSubscribers = maxSubscribers;
        this.emitterFactory = emitterFactory;
        this.executor = Executors.newSingleThreadScheduledExecutor(runnable -> {
            Thread thread = new Thread(runnable, "telemetry-sse");
            thread.setDaemon(true);
            return thread;
        });
        this.executor.scheduleAtFixedRate(this::heartbeat,
                HEARTBEAT_INTERVAL.toMillis(), HEARTBEAT_INTERVAL.toMillis(), TimeUnit.MILLISECONDS);
    }

    public SseEmitter subscribe() {
        if (emitters.size() >= maxSubscribers) {
            throw new SystemUnavailableException("El canal de telemetría está completo. Inténtalo más tarde.");
        }
        SseEmitter emitter = emitterFactory.get();
        emitter.onCompletion(() -> emitters.remove(emitter));
        emitter.onError(error -> emitters.remove(emitter));
        // Completar al expirar evita que el contenedor registre el timeout como un error.
        emitter.onTimeout(emitter::complete);
        emitters.add(emitter);
        // Un primer comentario hace que las cabeceras salgan ya y el cliente dé la conexión por abierta.
        send(emitter, SseEmitter.event().comment("connected"));
        return emitter;
    }

    @EventListener
    public void onTelemetry(SystemTelemetryEvent event) {
        if (emitters.isEmpty()) {
            return;
        }
        // Con la cola llena se descarta el evento: la telemetría es prescindible, la memoria no.
        if (pendingBroadcasts.incrementAndGet() > MAX_PENDING_BROADCASTS) {
            pendingBroadcasts.decrementAndGet();
            return;
        }
        TelemetryEvent payload = mapper.toDto(event);
        executor.execute(() -> {
            try {
                broadcast(() -> SseEmitter.event().data(payload, MediaType.APPLICATION_JSON));
            } finally {
                pendingBroadcasts.decrementAndGet();
            }
        });
    }

    public int subscriberCount() {
        return emitters.size();
    }

    @PreDestroy
    void shutdown() {
        executor.shutdownNow();
        emitters.forEach(SseEmitter::complete);
        emitters.clear();
    }

    private void heartbeat() {
        broadcast(() -> SseEmitter.event().comment("keep-alive"));
    }

    private void broadcast(Supplier<SseEventBuilder> event) {
        for (SseEmitter emitter : emitters) {
            send(emitter, event.get());
        }
    }

    // Un envío fallido significa que el cliente ya no está: se da de baja para no acumular emisores muertos.
    private void send(SseEmitter emitter, SseEventBuilder event) {
        try {
            emitter.send(event);
        } catch (IOException | IllegalStateException e) {
            emitters.remove(emitter);
            log.debug("Telemetry subscriber dropped: {}", e.getMessage());
        }
    }
}
