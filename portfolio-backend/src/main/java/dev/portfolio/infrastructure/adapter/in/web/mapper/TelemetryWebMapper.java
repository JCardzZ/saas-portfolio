package dev.portfolio.infrastructure.adapter.in.web.mapper;

import dev.portfolio.domain.model.SystemTelemetryEvent;
import dev.portfolio.model.TelemetryEvent;
import org.mapstruct.Mapper;
import org.mapstruct.ReportingPolicy;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;

@Mapper(componentModel = "spring", unmappedTargetPolicy = ReportingPolicy.ERROR)
public interface TelemetryWebMapper {

    TelemetryEvent toDto(SystemTelemetryEvent event);

    default OffsetDateTime toOffsetDateTime(Instant instant) {
        return instant.atOffset(ZoneOffset.UTC);
    }
}
