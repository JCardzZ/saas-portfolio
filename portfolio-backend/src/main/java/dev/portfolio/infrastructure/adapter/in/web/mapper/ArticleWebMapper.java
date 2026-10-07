package dev.portfolio.infrastructure.adapter.in.web.mapper;

import dev.portfolio.domain.model.ArticleDomain;
import dev.portfolio.model.Article;
import org.mapstruct.Mapper;
import org.mapstruct.ReportingPolicy;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;

@Mapper(componentModel = "spring", unmappedTargetPolicy = ReportingPolicy.ERROR)
public interface ArticleWebMapper {

    Article toDto(ArticleDomain article);

    List<Article> toDto(List<ArticleDomain> articles);

    default OffsetDateTime toOffsetDateTime(Instant instant) {
        return instant == null ? null : instant.atOffset(ZoneOffset.UTC);
    }
}
