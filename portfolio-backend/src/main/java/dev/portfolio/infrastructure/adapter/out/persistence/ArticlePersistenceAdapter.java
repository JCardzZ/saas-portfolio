package dev.portfolio.infrastructure.adapter.out.persistence;

import dev.portfolio.application.port.out.ArticleRepositoryPort;
import dev.portfolio.domain.model.ArticleDomain;
import dev.portfolio.infrastructure.adapter.out.persistence.mapper.ArticlePersistenceMapper;
import dev.portfolio.infrastructure.adapter.out.persistence.repository.ArticleJpaRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Component
@RequiredArgsConstructor
public class ArticlePersistenceAdapter implements ArticleRepositoryPort {

    private final ArticleJpaRepository repository;
    private final ArticlePersistenceMapper mapper;

    @Override
    @Transactional(readOnly = true)
    public List<ArticleDomain> findAllNewestFirst() {
        return mapper.toDomain(repository.findAllByOrderByPublishedAtDesc());
    }

    @Override
    @Transactional(readOnly = true)
    public boolean existsBySlug(String slug) {
        return repository.existsBySlug(slug);
    }

    @Override
    @Transactional
    public ArticleDomain save(ArticleDomain article) {
        return mapper.toDomain(repository.save(mapper.toEntity(article)));
    }
}
