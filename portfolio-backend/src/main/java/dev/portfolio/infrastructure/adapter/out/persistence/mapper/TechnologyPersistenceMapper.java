package dev.portfolio.infrastructure.adapter.out.persistence.mapper;

import dev.portfolio.domain.model.TechnologyDomain;
import dev.portfolio.infrastructure.adapter.out.persistence.entity.TechnologyEntity;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.ReportingPolicy;

import java.util.List;

@Mapper(componentModel = "spring", unmappedTargetPolicy = ReportingPolicy.ERROR)
public interface TechnologyPersistenceMapper {

    @Mapping(target = "isFeatured", source = "featured")
    @Mapping(target = "createdAt", ignore = true)
    TechnologyEntity toEntity(TechnologyDomain domain);

    @Mapping(target = "featured", source = "isFeatured")
    // MapStruct interpreta el wither del record como setter fluido; no es una propiedad.
    @Mapping(target = "withId", ignore = true)
    TechnologyDomain toDomain(TechnologyEntity entity);

    List<TechnologyDomain> toDomain(List<TechnologyEntity> entities);
}
