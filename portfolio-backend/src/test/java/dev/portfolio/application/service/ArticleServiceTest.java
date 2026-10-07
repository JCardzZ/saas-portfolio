package dev.portfolio.application.service;

import dev.portfolio.application.port.out.ArticleRepositoryPort;
import dev.portfolio.application.port.out.CachePort;
import dev.portfolio.domain.exception.InvalidRequestException;
import dev.portfolio.domain.model.ArticleDomain;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

class ArticleServiceTest {

    private static final ArticleDomain ARTICLE =
            new ArticleDomain("art-1", "Título", "titulo", "# Cuerpo", Instant.parse("2026-10-01T10:00:00Z"));

    private final ArticleRepositoryPort repository = mock(ArticleRepositoryPort.class);
    private final CachePort cache = mock(CachePort.class);
    private final ArticleService service = new ArticleService(repository, cache);

    @Test
    void servesFromCacheAndOnlyReadsTheDatabaseOnAMiss() {
        given(cache.getList(CacheKeys.ARTICLES_ALL, ArticleDomain.class)).willReturn(Optional.of(List.of(ARTICLE)));
        assertThat(service.findAll()).containsExactly(ARTICLE);
        verify(repository, never()).findAllNewestFirst();

        given(cache.getList(CacheKeys.ARTICLES_ALL, ArticleDomain.class)).willReturn(Optional.empty());
        given(repository.findAllNewestFirst()).willReturn(List.of(ARTICLE));
        assertThat(service.findAll()).containsExactly(ARTICLE);
        verify(cache).put(CacheKeys.ARTICLES_ALL, List.of(ARTICLE), CacheKeys.TTL);
    }

    @Test
    void publishesWithAGeneratedIdAndDateAndInvalidatesTheCache() {
        given(repository.save(any())).willAnswer(invocation -> invocation.getArgument(0));
        Instant before = Instant.now();

        ArticleDomain published = service.publish("  Hexagonal en la práctica ", "hexagonal-en-la-practica", "# Hola");

        assertThat(published.id()).isNotBlank();
        assertThat(published.title()).isEqualTo("Hexagonal en la práctica");
        assertThat(published.slug()).isEqualTo("hexagonal-en-la-practica");
        assertThat(published.publishedAt()).isBetween(before, Instant.now());
        verify(cache).evict(CacheKeys.ARTICLES_ALL);
    }

    @Test
    void rejectsMalformedSlugsDuplicatesAndEmptyArticlesWithoutSaving() {
        given(repository.existsBySlug("repetido")).willReturn(true);

        for (String slug : new String[]{"Con Mayúsculas", "con espacios", "-empieza-mal", "doble--guion", "", null}) {
            assertThatThrownBy(() -> service.publish("Título", slug, "cuerpo")).isInstanceOf(InvalidRequestException.class);
        }
        assertThatThrownBy(() -> service.publish("Título", "repetido", "cuerpo"))
                .isInstanceOf(InvalidRequestException.class).hasMessageContaining("repetido");
        assertThatThrownBy(() -> service.publish(" ", "valido", "cuerpo")).isInstanceOf(InvalidRequestException.class);
        assertThatThrownBy(() -> service.publish("Título", "valido", "  ")).isInstanceOf(InvalidRequestException.class);

        verify(repository, never()).save(any());
        verify(cache, never()).evict(any(String[].class));
    }
}
