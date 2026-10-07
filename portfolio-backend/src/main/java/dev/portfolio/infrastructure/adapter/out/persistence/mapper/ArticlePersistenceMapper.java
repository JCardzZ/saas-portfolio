package dev.portfolio.infrastructure.adapter.out.persistence.mapper;

import dev.portfolio.domain.model.ArticleDomain;
import dev.portfolio.infrastructure.adapter.out.persistence.entity.ArticleEntity;
import org.mapstruct.Mapper;
import org.mapstruct.ReportingPolicy;

import java.util.List;

@Mapper(componentModel = "spring", unmappedTargetPolicy = ReportingPolicy.ERROR)
public interface ArticlePersistenceMapper {

    ArticleEntity toEntity(ArticleDomain domain);

    ArticleDomain toDomain(ArticleEntity entity);

    List<ArticleDomain> toDomain(List<ArticleEntity> entities);
}
