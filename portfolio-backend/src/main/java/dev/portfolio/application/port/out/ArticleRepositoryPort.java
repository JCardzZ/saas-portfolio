package dev.portfolio.application.port.out;

import dev.portfolio.domain.model.ArticleDomain;

import java.util.List;

public interface ArticleRepositoryPort {

    List<ArticleDomain> findAllNewestFirst();

    boolean existsBySlug(String slug);

    ArticleDomain save(ArticleDomain article);
}
