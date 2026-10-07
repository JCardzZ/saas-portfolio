package dev.portfolio.application.service;

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
import org.mockito.ArgumentCaptor;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

class RAGServiceTest {

    private static final float[] QUERY_VECTOR = new float[EmbeddingDomain.DIMENSIONS];
    private static final RateLimitPolicy CLIENT_POLICY = new RateLimitPolicy(10, Duration.ofMinutes(1));
    private static final RateLimitPolicy GLOBAL_POLICY = new RateLimitPolicy(500, Duration.ofHours(24));
    private static final RateLimitDecision ALLOWED = new RateLimitDecision(true, 10, 9, Duration.ZERO);
    private static final RateLimitDecision DENIED = new RateLimitDecision(false, 10, 0, Duration.ofSeconds(30));

    private final GeminiAiPort ai = mock(GeminiAiPort.class);
    private final VectorRepositoryPort vectorRepository = mock(VectorRepositoryPort.class);
    private final RateLimiterPort rateLimiter = mock(RateLimiterPort.class);
    private final TelemetryPort telemetry = mock(TelemetryPort.class);
    private final RAGService service =
            new RAGService(ai, vectorRepository, rateLimiter, CLIENT_POLICY, GLOBAL_POLICY, telemetry);

    @BeforeEach
    void allowByDefault() {
        given(rateLimiter.tryAcquire(any(), any())).willReturn(ALLOWED);
    }

    @Test
    void answersFromTheTenantsMostSimilarFragmentsAndCitesThem() {
        EmbeddingDomain fragment = new EmbeddingDomain("emb-1", "acme", "backend/ResilienceConfig.java", 0,
                "@Bean CircuitBreaker...", Map.of("lineNumberRange", "40-55"), QUERY_VECTOR);
        given(ai.embedQuery("¿Cómo funciona el circuit breaker?")).willReturn(QUERY_VECTOR);
        given(vectorRepository.findMostSimilar("acme", QUERY_VECTOR, 3)).willReturn(List.of(fragment));
        given(ai.generateAnswer("¿Cómo funciona el circuit breaker?", List.of(fragment))).willReturn("Usa Resilience4j.");

        RAGAnswerDomain answer = service.query(
                new RAGQueryDomain("acme", "¿Cómo funciona el circuit breaker?", 3), "1.2.3.4");

        assertThat(answer.answer()).isEqualTo("Usa Resilience4j.");
        assertThat(answer.citations()).containsExactly(new RAGAnswerDomain.Citation(
                "backend/ResilienceConfig.java", "40-55", "@Bean CircuitBreaker..."));
    }

    @Test
    void reportsSearchAndAnswerUnderOneTraceWithoutLeakingTheQuestion() {
        EmbeddingDomain fragment = new EmbeddingDomain("emb-1", "acme", "docs/cache.md", 0,
                "TTL de 10 minutos", Map.of(), QUERY_VECTOR);
        given(ai.embedQuery("mi pregunta privada")).willReturn(QUERY_VECTOR);
        given(vectorRepository.findMostSimilar("acme", QUERY_VECTOR, RAGQueryDomain.DEFAULT_MAX_RESULTS))
                .willReturn(List.of(fragment));
        given(ai.generateAnswer(any(), any())).willReturn("Diez minutos.");

        service.query(RAGQueryDomain.of("acme", "mi pregunta privada"), "1.2.3.4");

        ArgumentCaptor<TelemetryEventType> types = ArgumentCaptor.captor();
        ArgumentCaptor<String> details = ArgumentCaptor.captor();
        ArgumentCaptor<String> traces = ArgumentCaptor.captor();
        verify(telemetry, org.mockito.Mockito.times(2)).publish(types.capture(), details.capture(), traces.capture());
        assertThat(types.getAllValues())
                .containsExactly(TelemetryEventType.VECTOR_SEARCH, TelemetryEventType.RAG_QUERY);
        assertThat(details.getAllValues().get(0)).matches("1 fragmentos · \\d+ ms");
        assertThat(details.getAllValues().get(1)).matches("respuesta con 1 citas · \\d+ ms");
        assertThat(traces.getAllValues().get(0)).isEqualTo(traces.getAllValues().get(1));
        assertThat(details.getAllValues()).noneMatch(detail ->
                detail.contains("pregunta") || detail.contains("1.2.3.4") || detail.contains("acme"));
    }

    @Test
    void doesNotCallTheModelWhenNothingIsIndexed() {
        given(ai.embedQuery("hola")).willReturn(QUERY_VECTOR);
        given(vectorRepository.findMostSimilar("acme", QUERY_VECTOR, RAGQueryDomain.DEFAULT_MAX_RESULTS))
                .willReturn(List.of());

        RAGAnswerDomain answer = service.query(RAGQueryDomain.of("acme", "hola"), "1.2.3.4");

        assertThat(answer.answer()).isEqualTo(RAGService.NO_CONTEXT_ANSWER);
        assertThat(answer.citations()).isEmpty();
        verify(ai, never()).generateAnswer(any(), any());
    }

    @Test
    void clientOverItsLimitIsRejectedBeforeSpendingGlobalBudgetOrCallingTheModel() {
        given(rateLimiter.tryAcquire("rag-query:client:1.2.3.4", CLIENT_POLICY)).willReturn(DENIED);

        assertThatThrownBy(() -> service.query(RAGQueryDomain.of("acme", "hola"), "1.2.3.4"))
                .isInstanceOf(RateLimitExceededException.class);

        verify(rateLimiter, never()).tryAcquire("rag-query:global", GLOBAL_POLICY);
        verifyNoInteractions(ai, vectorRepository, telemetry);
    }

    @Test
    void exhaustedGlobalBudgetRejectsEveryClient() {
        given(rateLimiter.tryAcquire("rag-query:global", GLOBAL_POLICY)).willReturn(DENIED);

        assertThatThrownBy(() -> service.query(RAGQueryDomain.of("acme", "hola"), "9.9.9.9"))
                .isInstanceOf(RateLimitExceededException.class);

        verifyNoInteractions(ai, vectorRepository, telemetry);
    }
}
