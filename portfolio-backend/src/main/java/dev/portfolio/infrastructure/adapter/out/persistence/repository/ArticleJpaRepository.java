package dev.portfolio.infrastructure.adapter.out.persistence.repository;

import dev.portfolio.infrastructure.adapter.out.persistence.entity.ArticleEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ArticleJpaRepository extends JpaRepository<ArticleEntity, String> {

    List<ArticleEntity> findAllByOrderByPublishedAtDesc();

    boolean existsBySlug(String slug);
}
