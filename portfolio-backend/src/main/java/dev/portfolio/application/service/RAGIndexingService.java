package dev.portfolio.application.service;

import dev.portfolio.application.port.in.RAGIndexingUseCase;
import dev.portfolio.application.port.out.ArchitectureProjectRepositoryPort;
import dev.portfolio.application.port.out.ArticleRepositoryPort;
import dev.portfolio.application.port.out.CareerStoryPort;
import dev.portfolio.application.port.out.CodeSourcePort;
import dev.portfolio.application.port.out.GeminiAiPort;
import dev.portfolio.application.port.out.ProjectRepositoryPort;
import dev.portfolio.application.port.out.TechnologyRepositoryPort;
import dev.portfolio.application.port.out.VectorRepositoryPort;
import dev.portfolio.domain.exception.ReindexInProgressException;
import dev.portfolio.domain.model.ArchitectureProjectDomain;
import dev.portfolio.domain.model.ArticleDomain;
import dev.portfolio.domain.model.EmbeddingDomain;
import dev.portfolio.domain.model.ProjectDomain;
import dev.portfolio.domain.model.SourceDocumentDomain;
import dev.portfolio.domain.model.TechnologyDomain;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.stream.Collectors;

public class RAGIndexingService implements RAGIndexingUseCase {

    static final String KIND_METADATA_KEY = "kind";
    static final String KIND_CMS = "cms";
    static final String KIND_CODE = "code";
    static final String KIND_CAREER = "career";

    private final TechnologyRepositoryPort technologyRepository;
    private final ProjectRepositoryPort projectRepository;
    private final ArticleRepositoryPort articleRepository;
    private final CareerStoryPort careerStory;
    private final CodeSourcePort codeSource;
    private final GeminiAiPort ai;
    private final VectorRepositoryPort vectorRepository;
    private final ArchitectureProjectRepositoryPort architectureProjects;

    // Solo protege dentro de esta instancia; con varias réplicas haría falta un bloqueo distribuido.
    private final AtomicBoolean running = new AtomicBoolean(false);

    public RAGIndexingService(TechnologyRepositoryPort technologyRepository,
                              ProjectRepositoryPort projectRepository,
                              ArticleRepositoryPort articleRepository,
                              CareerStoryPort careerStory,
                              CodeSourcePort codeSource,
                              GeminiAiPort ai,
                              VectorRepositoryPort vectorRepository,
                              ArchitectureProjectRepositoryPort architectureProjects) {
        this.architectureProjects = architectureProjects;
        this.technologyRepository = technologyRepository;
        this.projectRepository = projectRepository;
        this.articleRepository = articleRepository;
        this.careerStory = careerStory;
        this.codeSource = codeSource;
        this.ai = ai;
        this.vectorRepository = vectorRepository;
    }

    @Override
    public int reindex(String tenantId) {
        if (!running.compareAndSet(false, true)) {
            throw new ReindexInProgressException();
        }
        try {
            List<Fragment> fragments = fragment(collectDocuments());
            // Primero se calculan todos los embeddings: si el proveedor falla, el índice actual queda intacto.
            List<float[]> vectors = ai.embedDocuments(fragments.stream().map(Fragment::embeddingText).toList());

            List<EmbeddingDomain> embeddings = new ArrayList<>(fragments.size());
            for (int i = 0; i < fragments.size(); i++) {
                Fragment fragment = fragments.get(i);
                embeddings.add(new EmbeddingDomain(UUID.randomUUID().toString(), tenantId, fragment.sourceId(),
                        fragment.chunkIndex(), fragment.content(), fragment.metadata(), vectors.get(i)));
            }
            vectorRepository.replaceAllForTenant(tenantId, embeddings);
            return embeddings.size();
        } finally {
            running.set(false);
        }
    }

    private List<SourceDocumentDomain> collectDocuments() {
        List<TechnologyDomain> technologies = technologyRepository.findAll();
        Map<String, String> technologyNames = technologies.stream()
                .collect(Collectors.toMap(TechnologyDomain::id, TechnologyDomain::name));

        List<SourceDocumentDomain> documents = new ArrayList<>();
        technologies.forEach(technology -> documents.add(toDocument(technology)));
        projectRepository.findAll().forEach(project -> documents.add(toDocument(project, technologyNames)));
        articleRepository.findAllNewestFirst().forEach(article -> documents.add(toDocument(article)));
        // Las plantillas y proyectos del Estudio de arquitectura, para que el asistente sepa de ellos.
        architectureProjects.findAll().forEach(project -> documents.add(toDocument(project)));

        // La trayectoria se indexa siempre que exista, sin depender de que haya código configurado.
        Optional<SourceDocumentDomain> career = careerStory.loadDocument();
        career.ifPresent(document -> documents.add(withKind(document, KIND_CAREER)));
        String careerContent = career.map(SourceDocumentDomain::content).orElse(null);

        codeSource.loadDocuments().stream()
                // Si la carpeta de código también contiene ese archivo, no se indexa dos veces.
                .filter(document -> !document.content().equals(careerContent))
                .forEach(document -> documents.add(withKind(document, KIND_CODE)));
        return documents;
    }

    private static List<Fragment> fragment(List<SourceDocumentDomain> documents) {
        List<Fragment> fragments = new ArrayList<>();
        for (SourceDocumentDomain document : documents) {
            boolean isCode = KIND_CODE.equals(document.metadata().get(KIND_METADATA_KEY));
            List<TextChunker.Chunk> chunks = TextChunker.chunk(document.content());
            for (int i = 0; i < chunks.size(); i++) {
                TextChunker.Chunk chunk = chunks.get(i);
                Map<String, String> metadata = new HashMap<>(document.metadata());
                if (isCode) {
                    metadata.put(RAGService.LINE_RANGE_METADATA_KEY, chunk.lineRange());
                }
                fragments.add(new Fragment(document.sourceId(), i, chunk.content(), metadata));
            }
        }
        return fragments;
    }

    private static SourceDocumentDomain toDocument(ArchitectureProjectDomain project) {
        String cloud = project.cloudProvider().code();
        StringBuilder content = new StringBuilder()
                .append("Arquitectura del Estudio: ").append(project.title()).append('\n')
                .append("Nube: ").append(project.cloudProvider().displayName());
        if (project.description() != null) {
            content.append('\n').append("Descripción: ").append(project.description());
        }
        content.append('\n').append("Componentes:");
        for (Map<String, Object> node : project.nodes()) {
            Object service = node.get("service") instanceof Map<?, ?> byCloud ? byCloud.get(cloud) : node.get("service");
            content.append("\n- ").append(service).append(node.get("role") instanceof String role && !role.isBlank() ? " (" + role + ")" : "");
        }
        return new SourceDocumentDomain("architecture/projects/" + project.id(), content.toString(),
                Map.of(KIND_METADATA_KEY, KIND_CMS));
    }

    private static SourceDocumentDomain toDocument(TechnologyDomain technology) {
        String content = """
                Tecnología: %s
                Categoría: %s
                Nivel de dominio: %s
                Destacada: %s""".formatted(technology.name(), technology.category(),
                technology.proficiencyLevel(), technology.featured() ? "sí" : "no");
        return new SourceDocumentDomain("cms/technologies/" + technology.id(), content,
                Map.of(KIND_METADATA_KEY, KIND_CMS));
    }

    private static SourceDocumentDomain toDocument(ProjectDomain project, Map<String, String> technologyNames) {
        StringBuilder content = new StringBuilder()
                .append("Proyecto: ").append(project.title()).append('\n')
                .append("Resumen: ").append(project.summary()).append('\n')
                .append("Repositorio: ").append(project.githubRepoUrl());
        if (project.metricsImpact() != null) {
            content.append('\n').append("Impacto: ").append(project.metricsImpact());
        }
        if (project.demoVideoUrl() != null) {
            content.append('\n').append("Demo: ").append(project.demoVideoUrl());
        }
        if (!project.technologyIds().isEmpty()) {
            content.append('\n').append("Tecnologías: ").append(project.technologyIds().stream()
                    .map(id -> technologyNames.getOrDefault(id, id))
                    .collect(Collectors.joining(", ")));
        }
        return new SourceDocumentDomain("cms/projects/" + project.id(), content.toString(),
                Map.of(KIND_METADATA_KEY, KIND_CMS));
    }

    // El slug es el origen citable: el asistente muestra "cms/articles/<slug>" como fuente.
    private static SourceDocumentDomain toDocument(ArticleDomain article) {
        return new SourceDocumentDomain("cms/articles/" + article.slug(),
                "# " + article.title() + "\n\n" + article.contentMarkdown(), Map.of(KIND_METADATA_KEY, KIND_CMS));
    }

    private static SourceDocumentDomain withKind(SourceDocumentDomain document, String kind) {
        Map<String, String> metadata = new HashMap<>(document.metadata());
        metadata.put(KIND_METADATA_KEY, kind);
        return new SourceDocumentDomain(document.sourceId(), document.content(), metadata);
    }

    private record Fragment(String sourceId, int chunkIndex, String content, Map<String, String> metadata) {

        // El origen se antepone solo para el embedding: mejora la búsqueda sin ensuciar la cita.
        String embeddingText() {
            return sourceId + "\n" + content;
        }
    }
}
