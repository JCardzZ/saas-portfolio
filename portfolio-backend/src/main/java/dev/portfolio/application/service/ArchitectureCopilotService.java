package dev.portfolio.application.service;

import dev.portfolio.application.port.in.ArchitectureCopilotUseCase;
import dev.portfolio.application.port.in.CloudCatalogUseCase;
import dev.portfolio.application.port.out.GeminiAiPort;
import dev.portfolio.application.port.out.RateLimiterPort;
import dev.portfolio.application.port.out.TelemetryPort;
import dev.portfolio.application.port.out.VectorRepositoryPort;
import dev.portfolio.domain.exception.InvalidRequestException;
import dev.portfolio.domain.exception.RateLimitExceededException;
import dev.portfolio.domain.model.ArchitectureAdviceDomain;
import dev.portfolio.domain.model.ArchitectureAdviceDomain.Addition;
import dev.portfolio.domain.model.ArchitectureAdviceDomain.Recommendation;
import dev.portfolio.domain.model.ArchitectureGraph;
import dev.portfolio.domain.model.CloudCatalogItemDomain;
import dev.portfolio.domain.model.CloudProviderDomain;
import dev.portfolio.domain.model.EmbeddingDomain;
import dev.portfolio.domain.model.RateLimitDecision;
import dev.portfolio.domain.model.RateLimitPolicy;
import dev.portfolio.domain.model.TelemetryEventType;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * Copiloto de arquitectura: lleva al modelo la pregunta, el diagrama del lienzo, el catálogo de
 * piezas y los fragmentos indexados más cercanos, y devuelve sus recomendaciones ya filtradas.
 * <p>
 * Dos fronteras de confianza: el diagrama y la pregunta llegan de un visitante anónimo (se
 * acotan y se pasan al modelo como texto de una línea por dato), y la respuesta la redacta un
 * modelo (solo sobrevive lo que encaja en la forma, los tamaños y el catálogo esperados).
 * Comparte los límites de peticiones del asistente RAG: consume la misma cuota del proveedor.
 */
public class ArchitectureCopilotService implements ArchitectureCopilotUseCase {

    static final int MAX_PROMPT_LENGTH = 1000;
    static final int MAX_RECOMMENDATIONS = 3;
    static final int MAX_POINTS = 4;
    static final int MAX_ADDITIONS = 6;
    static final int MAX_SNIPPET_LENGTH = 1500;
    private static final int CONTEXT_FRAGMENTS = 4;
    private static final Set<String> SNIPPET_LANGUAGES = Set.of("java", "terraform", "solidity", "yaml", "sql", "bash");
    private static final Pattern CUSTOM_NAME = Pattern.compile("^[\\p{L}\\p{N}][\\p{L}\\p{N} .+#/_-]{0,39}$");
    private static final Pattern WHITESPACE = Pattern.compile("(?U)\\s+");

    private final GeminiAiPort ai;
    private final VectorRepositoryPort vectorRepository;
    private final CloudCatalogUseCase catalog;
    private final RateLimiterPort rateLimiter;
    private final RateLimitPolicy clientPolicy;
    private final RateLimitPolicy globalPolicy;
    private final TelemetryPort telemetry;

    public ArchitectureCopilotService(GeminiAiPort ai, VectorRepositoryPort vectorRepository, CloudCatalogUseCase catalog,
                                      RateLimiterPort rateLimiter, RateLimitPolicy clientPolicy, RateLimitPolicy globalPolicy,
                                      TelemetryPort telemetry) {
        this.ai = ai;
        this.vectorRepository = vectorRepository;
        this.catalog = catalog;
        this.rateLimiter = rateLimiter;
        this.clientPolicy = clientPolicy;
        this.globalPolicy = globalPolicy;
        this.telemetry = telemetry;
    }

    @Override
    public ArchitectureAdviceDomain advise(Question question, String clientAddress) {
        enforce(RAGService.CLIENT_RATE_LIMIT_KEY_PREFIX + clientAddress, clientPolicy);
        enforce(RAGService.GLOBAL_RATE_LIMIT_KEY, globalPolicy);

        String prompt = question.prompt() == null ? "" : question.prompt().strip();
        if (prompt.isEmpty()) {
            throw new InvalidRequestException("Escribe una pregunta para el copiloto");
        }
        if (prompt.length() > MAX_PROMPT_LENGTH) {
            throw new InvalidRequestException("La pregunta no puede superar los %d caracteres".formatted(MAX_PROMPT_LENGTH));
        }
        if (question.cloudProvider() == null) {
            throw new InvalidRequestException("La topología necesita una nube");
        }
        ArchitectureGraph.validate(question.nodes(), question.connections(), List.of());

        long started = System.nanoTime();
        List<CloudCatalogItemDomain> items = catalog.find(Optional.of(question.cloudProvider()));
        List<EmbeddingDomain> context =
                vectorRepository.findMostSimilar(question.tenantId(), ai.embedQuery(prompt), CONTEXT_FRAGMENTS);

        ArchitectureAdviceDomain raw = ai.adviseArchitecture(prompt, describe(question),
                items.stream().map(item -> item.code() + ": " + item.name()).toList(), context);
        ArchitectureAdviceDomain advice = sanitize(raw,
                items.stream().map(CloudCatalogItemDomain::code).collect(Collectors.toSet()),
                question.nodes().stream().map(node -> String.valueOf(node.get("id"))).collect(Collectors.toSet()));

        // La telemetría es pública: recuentos y latencia, nunca la pregunta ni el diagrama.
        telemetry.publish(TelemetryEventType.RAG_QUERY, "copiloto · %d recomendaciones · %d ms"
                .formatted(advice.recommendations().size(), (System.nanoTime() - started) / 1_000_000));
        return advice;
    }

    /** El diagrama como texto: una línea por nodo y por conexión, con cada dato acotado y sin saltos de línea. */
    static String describe(Question question) {
        CloudProviderDomain provider = question.cloudProvider();
        StringBuilder text = new StringBuilder("Nube: ").append(provider.displayName()).append("\nNodos (id | servicio | zona | función):\n");
        for (Map<String, Object> node : question.nodes()) {
            Object service = node.get("service") instanceof Map<?, ?> byCloud ? byCloud.get(provider.code()) : node.get("service");
            text.append("- ").append(clip(node.get("id"), 48)).append(" | ").append(clip(service, 60)).append(" | ")
                    .append(clip(node.get("zone"), 16)).append(" | ").append(clip(node.get("role"), 80)).append('\n');
        }
        text.append("Conexiones (origen -> destino):\n");
        for (Map<String, Object> link : question.connections()) {
            text.append("- ").append(clip(link.get("from"), 48)).append(" -> ").append(clip(link.get("to"), 48)).append('\n');
        }
        return text.toString().stripTrailing();
    }

    /**
     * Deja de la respuesta del modelo solo lo que tiene la forma esperada: textos de una longitud
     * razonable, un lenguaje de fragmento conocido y piezas que estén en el catálogo (o marcadas
     * como propias, con un nombre sencillo) y que se conecten desde un nodo que exista.
     */
    static ArchitectureAdviceDomain sanitize(ArchitectureAdviceDomain raw, Set<String> catalogCodes, Set<String> nodeIds) {
        List<Recommendation> recommendations = new ArrayList<>();
        for (Recommendation recommendation : raw.recommendations()) {
            String title = text(recommendation.title(), 120);
            if (title.isEmpty() || recommendations.size() == MAX_RECOMMENDATIONS) {
                continue;
            }
            String language = recommendation.snippetLanguage() == null ? "" : recommendation.snippetLanguage().strip().toLowerCase();
            String snippet = recommendation.snippet() == null ? "" : recommendation.snippet().strip();
            boolean keepSnippet = SNIPPET_LANGUAGES.contains(language) && !snippet.isEmpty();

            List<Addition> additions = new ArrayList<>();
            Set<String> seen = new LinkedHashSet<>();
            for (Addition addition : recommendation.additions() == null ? List.<Addition>of() : recommendation.additions()) {
                String code = addition.code() == null ? "" : addition.code().strip();
                String name = text(addition.name(), 40);
                boolean custom = Addition.CUSTOM.equals(code) && CUSTOM_NAME.matcher(name).matches();
                if ((!custom && !catalogCodes.contains(code)) || additions.size() == MAX_ADDITIONS || !seen.add(code + "/" + name)) {
                    continue;
                }
                String from = addition.connectFrom() == null ? null : addition.connectFrom().strip();
                additions.add(new Addition(code, custom ? name : null, emptyToNull(text(addition.role(), 60)),
                        from != null && nodeIds.contains(from) ? from : null));
            }
            recommendations.add(new Recommendation(title, points(recommendation.pros()), points(recommendation.cons()),
                    keepSnippet ? language : null,
                    keepSnippet ? snippet.substring(0, Math.min(snippet.length(), MAX_SNIPPET_LENGTH)) : null, additions));
        }
        String answer = raw.answer() == null ? "" : raw.answer().strip();
        return new ArchitectureAdviceDomain(answer.substring(0, Math.min(answer.length(), 2000)), recommendations);
    }

    private static List<String> points(List<String> points) {
        return points == null ? List.of() : points.stream().map(point -> text(point, 200)).filter(point -> !point.isEmpty())
                .limit(MAX_POINTS).toList();
    }

    private static String text(String value, int max) {
        return value == null ? "" : clip(value, max);
    }

    private static String clip(Object value, int max) {
        String line = value instanceof String text ? WHITESPACE.matcher(text).replaceAll(" ").strip() : "";
        return line.substring(0, Math.min(line.length(), max));
    }

    private static String emptyToNull(String value) {
        return value.isEmpty() ? null : value;
    }

    private void enforce(String key, RateLimitPolicy policy) {
        RateLimitDecision decision = rateLimiter.tryAcquire(key, policy);
        if (!decision.allowed()) {
            throw new RateLimitExceededException(decision.limit(), decision.retryAfter());
        }
    }
}
