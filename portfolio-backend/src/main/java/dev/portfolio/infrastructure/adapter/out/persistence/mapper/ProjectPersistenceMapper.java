package dev.portfolio.infrastructure.adapter.out.persistence.mapper;

import dev.portfolio.domain.model.ProjectDomain;
import dev.portfolio.infrastructure.adapter.out.persistence.entity.ProjectEntity;
import dev.portfolio.infrastructure.adapter.out.persistence.entity.TechnologyEntity;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.ReportingPolicy;

import java.util.List;
import java.util.Set;

@Mapper(componentModel = "spring", unmappedTargetPolicy = ReportingPolicy.ERROR)
public interface ProjectPersistenceMapper {

    @Mapping(target = "technologies", source = "technologies")
    @Mapping(target = "createdAt", ignore = true)
    ProjectEntity toEntity(ProjectDomain domain, Set<TechnologyEntity> technologies);

    @Mapping(target = "technologyIds", source = "technologies")
    // MapStruct interpreta el wither del record como setter fluido; no es una propiedad.
    @Mapping(target = "withId", ignore = true)
    ProjectDomain toDomain(ProjectEntity entity);

    List<ProjectDomain> toDomain(List<ProjectEntity> entities);

    default List<String> toTechnologyIds(Set<TechnologyEntity> technologies) {
        return technologies.stream().map(TechnologyEntity::getId).sorted().toList();
    }
}
