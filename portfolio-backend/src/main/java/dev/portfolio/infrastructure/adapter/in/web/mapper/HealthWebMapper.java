package dev.portfolio.infrastructure.adapter.in.web.mapper;

import dev.portfolio.domain.model.SystemHealthDomain;
import dev.portfolio.model.SystemHealthResponse;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.ReportingPolicy;

@Mapper(componentModel = "spring", unmappedTargetPolicy = ReportingPolicy.ERROR)
public interface HealthWebMapper {

    /** @param version la release desplegada (vX.Y.Z); vacía o nula, la respuesta no la incluye */
    @Mapping(target = "status", expression = "java(health.status().name())")
    @Mapping(target = "database", source = "health.database.description")
    @Mapping(target = "redisCache", source = "health.cache.description")
    @Mapping(target = "circuitBreakers.aiEngine", source = "health.aiEngineCircuit")
    @Mapping(target = "version", expression = "java(version == null || version.isBlank() ? null : version.strip())")
    SystemHealthResponse toDto(SystemHealthDomain health, String version);
}
