package dev.portfolio.application.service;

import dev.portfolio.application.port.in.ArticleUseCase;
import dev.portfolio.application.port.out.ArticleRepositoryPort;
import dev.portfolio.application.port.out.CachePort;
import dev.portfolio.domain.exception.InvalidRequestException;
import dev.portfolio.domain.model.ArticleDomain;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public class ArticleService implements ArticleUseCase {

    private final ArticleRepositoryPort repository;
    private final CachePort cache;

    public ArticleService(ArticleRepositoryPort repository, CachePort cache) {
        this.repository = repository;
        this.cache = cache;
    }

    @Override
    public List<ArticleDomain> findAll() {
        return cache.getList(CacheKeys.ARTICLES_ALL, ArticleDomain.class)
                .orElseGet(() -> {
                    List<ArticleDomain> articles = repository.findAllNewestFirst();
                    cache.put(CacheKeys.ARTICLES_ALL, articles, CacheKeys.TTL);
                    return articles;
                });
    }

    @Override
    public ArticleDomain publish(String title, String slug, String contentMarkdown) {
        if (title == null || title.isBlank() || contentMarkdown == null || contentMarkdown.isBlank()) {
            throw new InvalidRequestException("El artículo necesita título y contenido");
        }
        if (!ArticleDomain.isValidSlug(slug)) {
            throw new InvalidRequestException("El slug solo admite minúsculas, cifras y guiones (p. ej. mi-articulo)");
        }
        if (repository.existsBySlug(slug)) {
            throw new InvalidRequestException("Ya existe un artículo con el slug '%s'".formatted(slug));
        }
        ArticleDomain saved = repository.save(new ArticleDomain(
                UUID.randomUUID().toString(), title.strip(), slug, contentMarkdown, Instant.now()));
        cache.evict(CacheKeys.ARTICLES_ALL);
        return saved;
    }
}
