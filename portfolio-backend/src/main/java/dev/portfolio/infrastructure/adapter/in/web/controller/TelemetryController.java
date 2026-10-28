package dev.portfolio.infrastructure.adapter.in.web.controller;

import dev.portfolio.api.TelemetryObservabilityApi;
import dev.portfolio.application.port.in.SystemHealthUseCase;
import dev.portfolio.infrastructure.adapter.in.web.mapper.HealthWebMapper;
import dev.portfolio.infrastructure.adapter.in.web.sse.TelemetryStreamBroadcaster;
import dev.portfolio.model.SystemHealthResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@RestController
public class TelemetryController implements TelemetryObservabilityApi {

    private final SystemHealthUseCase systemHealthUseCase;
    private final HealthWebMapper mapper;
    private final TelemetryStreamBroadcaster telemetryStream;
    private final String releaseVersion;

    public TelemetryController(SystemHealthUseCase systemHealthUseCase, HealthWebMapper mapper,
                               TelemetryStreamBroadcaster telemetryStream,
                               @Value("${release.version:}") String releaseVersion) {
        this.systemHealthUseCase = systemHealthUseCase;
        this.mapper = mapper;
        this.telemetryStream = telemetryStream;
        this.releaseVersion = releaseVersion;
    }

    @Override
    public ResponseEntity<SystemHealthResponse> telemetryHealthGet() {
        return ResponseEntity.ok(mapper.toDto(systemHealthUseCase.check(), releaseVersion));
    }

    @Override
    public ResponseEntity<SseEmitter> telemetryLiveStreamGet() {
        return ResponseEntity.ok()
                .contentType(MediaType.TEXT_EVENT_STREAM)
                .cacheControl(CacheControl.noStore())
                // Evita que un proxy inverso (nginx) acumule los eventos antes de entregarlos.
                .header("X-Accel-Buffering", "no")
                .body(telemetryStream.subscribe());
    }
}
