package dev.portfolio.application.port.in;

import dev.portfolio.domain.model.ArticleDomain;

import java.util.List;

public interface ArticleUseCase {

    /** @return los artículos publicados, del más reciente al más antiguo */
    List<ArticleDomain> findAll();

    ArticleDomain publish(String title, String slug, String contentMarkdown);
}
