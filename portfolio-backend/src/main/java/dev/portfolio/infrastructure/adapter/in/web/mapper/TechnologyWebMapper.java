package dev.portfolio.infrastructure.adapter.in.web.mapper;

import dev.portfolio.domain.model.TechnologyDomain;
import dev.portfolio.model.Technology;
import dev.portfolio.model.TechnologyRequest;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.ReportingPolicy;

import java.util.List;

@Mapper(componentModel = "spring", unmappedTargetPolicy = ReportingPolicy.ERROR)
public interface TechnologyWebMapper {

    @Mapping(target = "id", ignore = true)
    @Mapping(target = "featured", source = "isFeatured")
    // MapStruct interpreta el wither del record como setter fluido; no es una propiedad.
    @Mapping(target = "withId", ignore = true)
    TechnologyDomain toDomain(TechnologyRequest request);

    @Mapping(target = "isFeatured", source = "featured")
    Technology toDto(TechnologyDomain domain);

    List<Technology> toDto(List<TechnologyDomain> domains);
}
