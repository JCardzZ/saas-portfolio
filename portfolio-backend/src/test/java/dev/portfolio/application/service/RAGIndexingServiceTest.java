package dev.portfolio.application.service;

import dev.portfolio.domain.model.CloudProviderDomain;
import dev.portfolio.domain.model.ArchitectureProjectDomain;
import dev.portfolio.application.port.out.ArchitectureProjectRepositoryPort;
import dev.portfolio.application.port.out.ArticleRepositoryPort;
import dev.portfolio.application.port.out.CareerStoryPort;
import dev.portfolio.application.port.out.CodeSourcePort;
import dev.portfolio.application.port.out.GeminiAiPort;
import dev.portfolio.application.port.out.ProjectRepositoryPort;
import dev.portfolio.application.port.out.TechnologyRepositoryPort;
import dev.portfolio.application.port.out.VectorRepositoryPort;
import dev.portfolio.domain.exception.AiServiceUnavailableException;
import dev.portfolio.domain.model.ArticleDomain;
import dev.portfolio.domain.model.EmbeddingDomain;
import dev.portfolio.domain.model.ProjectDomain;
import dev.portfolio.domain.model.SourceDocumentDomain;
import dev.portfolio.domain.model.TechnologyDomain;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

class RAGIndexingServiceTest {

    private final TechnologyRepositoryPort technologyRepository = mock(TechnologyRepositoryPort.class);
    private final ProjectRepositoryPort projectRepository = mock(ProjectRepositoryPort.class);
    private final ArticleRepositoryPort articleRepository = mock(ArticleRepositoryPort.class);
    private final CareerStoryPort careerStory = mock(CareerStoryPort.class);
    private final CodeSourcePort codeSource = mock(CodeSourcePort.class);
    private final GeminiAiPort ai = mock(GeminiAiPort.class);
    private final VectorRepositoryPort vectorRepository = mock(VectorRepositoryPort.class);
    private final ArchitectureProjectRepositoryPort architectureProjects = mock(ArchitectureProjectRepositoryPort.class);
    private final RAGIndexingService service =
            new RAGIndexingService(
                    technologyRepository, projectRepository, articleRepository, careerStory, codeSource, ai,
                    vectorRepository, architectureProjects);

    @BeforeEach
    void setUp() {
        given(technologyRepository.findAll()).willReturn(List.of(
                new TechnologyDomain("tech-1", "Java 21", "Backend", "Expert", "https://cdn/java.svg", true)));
        given(projectRepository.findAll()).willReturn(List.of(new ProjectDomain(
                "prj-1", "SaaS Portfolio", "Plataforma hexagonal", "https://github.com/u/r", null,
                "P99 1.2ms", List.of("tech-1"))));
        given(articleRepository.findAllNewestFirst()).willReturn(List.of(new ArticleDomain(
                "art-1", "Cache-aside resiliente", "cache-aside-resiliente", "Redis nunca tumba la API.",
                java.time.Instant.parse("2026-10-01T10:00:00Z"))));
        given(careerStory.loadDocument()).willReturn(Optional.empty());
        given(architectureProjects.findAll()).willReturn(List.of());
        given(codeSource.loadDocuments()).willReturn(List.of(
                new SourceDocumentDomain("backend/Foo.java", "class Foo {\n}", Map.of())));
        given(ai.embedDocuments(anyList())).willAnswer(invocation ->
                invocation.<List<String>>getArgument(0).stream()
                        .map(text -> new float[EmbeddingDomain.DIMENSIONS]).toList());
    }

    @Test
    void indexesCmsContentAndCodeForTheTenantReplacingThePreviousIndex() {
        int indexed = service.reindex("acme");

        ArgumentCaptor<List<EmbeddingDomain>> saved = ArgumentCaptor.captor();
        verify(vectorRepository).replaceAllForTenant(eq("acme"), saved.capture());
        assertThat(indexed).isEqualTo(4);
        assertThat(saved.getValue()).extracting(EmbeddingDomain::sourceId).containsExactly(
                "cms/technologies/tech-1", "cms/projects/prj-1", "cms/articles/cache-aside-resiliente", "backend/Foo.java");

        // El artículo se indexa con su título y su slug como origen citable.
        EmbeddingDomain article = saved.getValue().get(2);
        assertThat(article.content()).isEqualTo("# Cache-aside resiliente\n\nRedis nunca tumba la API.");
        assertThat(article.metadata()).containsEntry("kind", "cms");
        assertThat(saved.getValue()).allSatisfy(embedding -> assertThat(embedding.tenantId()).isEqualTo("acme"));

        EmbeddingDomain project = saved.getValue().get(1);
        assertThat(project.content()).contains("Proyecto: SaaS Portfolio", "Impacto: P99 1.2ms", "Tecnologías: Java 21")
                .doesNotContain("Demo:");
        assertThat(project.metadata()).containsEntry("kind", "cms").doesNotContainKey("lineNumberRange");

        EmbeddingDomain code = saved.getValue().get(3);
        assertThat(code.content()).isEqualTo("class Foo {\n}");
        assertThat(code.metadata()).containsEntry("kind", "code").containsEntry("lineNumberRange", "1-2");
    }

    @Test
    void indexesTheCareerStoryEvenWithoutCodeSourceAndNeverTwice() {
        String story = "# Trayectoria\n\n## 2023 - 2025 — Plataforma de pagos\n\nRediseñé el núcleo transaccional.";
        given(careerStory.loadDocument()).willReturn(Optional.of(
                new SourceDocumentDomain("docs/career/CAREER_STORY.md", story, Map.of())));
        // La carpeta de código contiene el mismo archivo (como en la imagen Docker) y otro distinto.
        given(codeSource.loadDocuments()).willReturn(List.of(
                new SourceDocumentDomain("career/CAREER_STORY.md", story, Map.of()),
                new SourceDocumentDomain("backend/Foo.java", "class Foo {\n}", Map.of())));

        service.reindex("acme");

        ArgumentCaptor<List<EmbeddingDomain>> saved = ArgumentCaptor.captor();
        verify(vectorRepository).replaceAllForTenant(eq("acme"), saved.capture());
        assertThat(saved.getValue()).extracting(EmbeddingDomain::sourceId).containsExactly(
                "cms/technologies/tech-1", "cms/projects/prj-1", "cms/articles/cache-aside-resiliente",
                "docs/career/CAREER_STORY.md", "backend/Foo.java");
        EmbeddingDomain career = saved.getValue().get(3);
        assertThat(career.content()).contains("Plataforma de pagos");
        assertThat(career.metadata()).containsEntry("kind", "career");
    }

    @Test
    void indexesTheArchitecturePresetsSoTheAssistantKnowsThem() {
        given(architectureProjects.findAll()).willReturn(List.of(new ArchitectureProjectDomain(
                "legacy-core", "Core legado integrado por colas (Mainframe + MQ + Spring Batch + Lambda + SQS)", "Las APIs hablan con el core por colas.",
                CloudProviderDomain.AWS,
                List.of(Map.of("id", "api", "service", Map.of("aws", "ECS Fargate", "gcp", "Cloud Run", "azure", "Container Apps"), "role", "API Spring Boot"),
                        Map.of("id", "mq", "service", "IBM MQ", "role", "")),
                List.of(), List.of(), true, java.time.Instant.parse("2026-10-01T10:00:00Z"))));

        service.reindex("acme");

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<EmbeddingDomain>> stored = ArgumentCaptor.forClass(List.class);
        verify(vectorRepository).replaceAllForTenant(eq("acme"), stored.capture());
        EmbeddingDomain preset = stored.getValue().stream()
                .filter(embedding -> embedding.sourceId().equals("architecture/projects/legacy-core")).findFirst().orElseThrow();
        assertThat(preset.content())
                .contains("Arquitectura del Estudio: Core legado integrado por colas", "Nube: AWS", "Las APIs hablan con el core por colas.")
                .contains("- ECS Fargate (API Spring Boot)", "- IBM MQ")
                .doesNotContain("Cloud Run");
    }

    @Test
    void embedsEachFragmentTogetherWithItsSourcePath() {
        service.reindex("acme");

        ArgumentCaptor<List<String>> texts = ArgumentCaptor.captor();
        verify(ai).embedDocuments(texts.capture());
        assertThat(texts.getValue().get(3)).isEqualTo("backend/Foo.java\nclass Foo {\n}");
    }

    @Test
    void keepsTheCurrentIndexWhenEmbeddingFailsAndAllowsRetrying() {
        given(ai.embedDocuments(anyList())).willThrow(new AiServiceUnavailableException("caído"));

        assertThatThrownBy(() -> service.reindex("acme")).isInstanceOf(AiServiceUnavailableException.class);
        verify(vectorRepository, never()).replaceAllForTenant(any(), any());

        // El fallo libera el bloqueo: un segundo intento no se rechaza como "en curso".
        assertThatThrownBy(() -> service.reindex("acme")).isInstanceOf(AiServiceUnavailableException.class);
    }
}
