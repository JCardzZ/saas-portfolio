package dev.portfolio.infrastructure.adapter.in.web.mapper;

import dev.portfolio.domain.model.SystemHealthDomain;
import dev.portfolio.model.SystemHealthResponse;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.ReportingPolicy;

@Mapper(componentModel = "spring", unmappedTargetPolicy = ReportingPolicy.ERROR)
public interface HealthWebMapper {

    @Mapping(target = "status", expression = "java(health.status().name())")
    @Mapping(target = "database", source = "database.description")
    @Mapping(target = "redisCache", source = "cache.description")
    @Mapping(target = "circuitBreakers.aiEngine", source = "aiEngineCircuit")
    SystemHealthResponse toDto(SystemHealthDomain health);
}
