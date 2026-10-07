package dev.portfolio.infrastructure.adapter.in.web.mapper;

import dev.portfolio.domain.model.ProjectDomain;
import dev.portfolio.model.Project;
import dev.portfolio.model.ProjectRequest;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.ReportingPolicy;

import java.util.List;

@Mapper(componentModel = "spring", unmappedTargetPolicy = ReportingPolicy.ERROR)
public interface ProjectWebMapper {

    @Mapping(target = "id", ignore = true)
    @Mapping(target = "technologyIds", source = "technologiesUsed")
    // MapStruct interpreta el wither del record como setter fluido; no es una propiedad.
    @Mapping(target = "withId", ignore = true)
    ProjectDomain toDomain(ProjectRequest request);

    @Mapping(target = "technologiesUsed", source = "technologyIds")
    Project toDto(ProjectDomain domain);

    List<Project> toDto(List<ProjectDomain> domains);
}
