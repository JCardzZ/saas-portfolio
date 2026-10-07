package dev.portfolio.infrastructure.adapter.in.web.controller;

import dev.portfolio.api.AdminTechnicalBlogCmsApi;
import dev.portfolio.application.port.in.ArticleUseCase;
import dev.portfolio.infrastructure.adapter.in.web.mapper.ArticleWebMapper;
import dev.portfolio.model.Article;
import dev.portfolio.model.ArticleRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
public class AdminArticlesController implements AdminTechnicalBlogCmsApi {

    private final ArticleUseCase articleUseCase;
    private final ArticleWebMapper mapper;

    @Override
    public ResponseEntity<Article> adminArticlesPost(ArticleRequest articleRequest) {
        return ResponseEntity.status(HttpStatus.CREATED).body(mapper.toDto(articleUseCase.publish(
                articleRequest.getTitle(), articleRequest.getSlug(), articleRequest.getContentMarkdown())));
    }
}
