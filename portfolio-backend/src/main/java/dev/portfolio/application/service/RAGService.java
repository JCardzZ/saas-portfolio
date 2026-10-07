package dev.portfolio.application.service;

import dev.portfolio.application.port.in.RAGUseCase;
import dev.portfolio.application.port.out.GeminiAiPort;
import dev.portfolio.application.port.out.RateLimiterPort;
import dev.portfolio.application.port.out.TelemetryPort;
import dev.portfolio.application.port.out.VectorRepositoryPort;
import dev.portfolio.domain.exception.RateLimitExceededException;
import dev.portfolio.domain.model.EmbeddingDomain;
import dev.portfolio.domain.model.RAGAnswerDomain;
import dev.portfolio.domain.model.RAGQueryDomain;
import dev.portfolio.domain.model.RateLimitDecision;
import dev.portfolio.domain.model.RateLimitPolicy;
import dev.portfolio.domain.model.TelemetryEventType;

import java.util.List;
import java.util.UUID;

public class RAGService implements RAGUseCase {

    static final String NO_CONTEXT_ANSWER =
            "Todavía no hay contenido indexado con el que responder a esta pregunta.";
    static final String LINE_RANGE_METADATA_KEY = "lineNumberRange";

    // Compartidas con el copiloto de arquitectura: las dos cosas gastan la misma cuota del proveedor.
    static final String CLIENT_RATE_LIMIT_KEY_PREFIX = "rag-query:client:";
    static final String GLOBAL_RATE_LIMIT_KEY = "rag-query:global";

    private final GeminiAiPort ai;
    private final VectorRepositoryPort vectorRepository;
    private final RateLimiterPort rateLimiter;
    private final RateLimitPolicy clientPolicy;
    private final RateLimitPolicy globalPolicy;
    private final TelemetryPort telemetry;

    public RAGService(GeminiAiPort ai,
                      VectorRepositoryPort vectorRepository,
                      RateLimiterPort rateLimiter,
                      RateLimitPolicy clientPolicy,
                      RateLimitPolicy globalPolicy,
                      TelemetryPort telemetry) {
        this.telemetry = telemetry;
        this.ai = ai;
        this.vectorRepository = vectorRepository;
        this.rateLimiter = rateLimiter;
        this.clientPolicy = clientPolicy;
        this.globalPolicy = globalPolicy;
    }

    @Override
    public RAGAnswerDomain query(RAGQueryDomain query, String clientAddress) {
        // Primero el límite por cliente: quien ya está bloqueado no consume el tope global.
        enforce(CLIENT_RATE_LIMIT_KEY_PREFIX + clientAddress, clientPolicy);
        enforce(GLOBAL_RATE_LIMIT_KEY, globalPolicy);

        // La telemetría es pública: lleva recuentos y latencias, nunca el texto de la pregunta.
        String traceId = UUID.randomUUID().toString();
        long started = System.nanoTime();

        float[] queryVector = ai.embedQuery(query.prompt());
        long searchStarted = System.nanoTime();
        List<EmbeddingDomain> context =
                vectorRepository.findMostSimilar(query.tenantId(), queryVector, query.maxResults());
        telemetry.publish(TelemetryEventType.VECTOR_SEARCH,
                "%d fragmentos · %d ms".formatted(context.size(), elapsedMillis(searchStarted)), traceId);

        // Sin contexto no se llama al modelo: respondería de memoria, que es justo lo que RAG evita.
        if (context.isEmpty()) {
            telemetry.publish(TelemetryEventType.RAG_QUERY,
                    "sin contenido indexado · %d ms".formatted(elapsedMillis(started)), traceId);
            return new RAGAnswerDomain(NO_CONTEXT_ANSWER, List.of());
        }
        String answer = ai.generateAnswer(query.prompt(), context);
        telemetry.publish(TelemetryEventType.RAG_QUERY,
                "respuesta con %d citas · %d ms".formatted(context.size(), elapsedMillis(started)), traceId);
        return new RAGAnswerDomain(answer, context.stream().map(RAGService::toCitation).toList());
    }

    private static long elapsedMillis(long startedNanos) {
        return (System.nanoTime() - startedNanos) / 1_000_000;
    }

    private void enforce(String key, RateLimitPolicy policy) {
        RateLimitDecision decision = rateLimiter.tryAcquire(key, policy);
        if (!decision.allowed()) {
            throw new RateLimitExceededException(decision.limit(), decision.retryAfter());
        }
    }

    private static RAGAnswerDomain.Citation toCitation(EmbeddingDomain fragment) {
        return new RAGAnswerDomain.Citation(
                fragment.sourceId(), fragment.metadata().get(LINE_RANGE_METADATA_KEY), fragment.content());
    }
}
