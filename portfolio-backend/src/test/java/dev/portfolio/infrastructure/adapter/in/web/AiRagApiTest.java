package dev.portfolio.infrastructure.adapter.in.web;

import static org.mockito.ArgumentMatchers.eq;
import static org.assertj.core.api.Assertions.assertThat;
import org.mockito.ArgumentCaptor;
import dev.portfolio.domain.exception.InvalidRequestException;
import dev.portfolio.domain.model.CloudProviderDomain;
import dev.portfolio.domain.model.ArchitectureAdviceDomain;
import dev.portfolio.application.port.in.ArchitectureCopilotUseCase;
import dev.portfolio.application.port.in.RAGIndexingUseCase;
import dev.portfolio.application.port.in.RAGUseCase;
import dev.portfolio.domain.exception.AiServiceUnavailableException;
import dev.portfolio.domain.exception.RateLimitExceededException;
import dev.portfolio.domain.model.RAGAnswerDomain;
import dev.portfolio.domain.model.RAGQueryDomain;
import dev.portfolio.infrastructure.adapter.in.web.controller.AiRagController;
import dev.portfolio.infrastructure.adapter.in.web.error.ProblemDetailFactory;
import dev.portfolio.infrastructure.adapter.in.web.mapper.RagWebMapperImpl;
import dev.portfolio.infrastructure.adapter.in.web.tenant.TenantResolver;
import dev.portfolio.infrastructure.config.SecurityConfig;
import dev.portfolio.infrastructure.security.JwtTokenService;
import dev.portfolio.infrastructure.security.ProblemDetailSecurityHandler;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;
import dev.portfolio.application.port.out.TelemetryPort;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.core.task.SyncTaskExecutor;
import org.springframework.core.task.TaskExecutor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(controllers = AiRagController.class)
@Import({
        SecurityConfig.class,
        JwtTokenService.class,
        ProblemDetailSecurityHandler.class,
        ProblemDetailFactory.class,
        RagWebMapperImpl.class,
        TenantResolver.class,
        AiRagApiTest.SyncExecutorConfig.class
})
@TestPropertySource(properties = "security.jwt.secret=" + AiRagApiTest.SECRET)
class AiRagApiTest {

    static final String SECRET = "dGVzdC1vbmx5LWhtYWMta2V5LTAxMjM0NTY3ODlhYmNkZWY=";

    // Ejecuta la reindexación en el mismo hilo para poder verificarla sin esperas.
    @TestConfiguration
    static class SyncExecutorConfig {
        @Bean("applicationTaskExecutor")
        TaskExecutor applicationTaskExecutor() {
            return new SyncTaskExecutor();
        }
    }

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private TelemetryPort telemetryPort;

    @MockBean
    private RAGUseCase ragUseCase;

    @MockBean
    private RAGIndexingUseCase ragIndexingUseCase;

    @MockBean
    private ArchitectureCopilotUseCase copilotUseCase;

    private static final String COPILOT_BODY = """
            {"prompt":"¿Cómo la hago más resiliente?","cloudProvider":"aws",
             "nodes":[{"id":"api","service":{"aws":"ECS Fargate","gcp":"Cloud Run","azure":"Container Apps"}}],"connections":[]}""";

    @Test
    void anyoneCanAskTheCopilotAndGetsRecommendationsWithTheirTradeOffs() throws Exception {
        given(copilotUseCase.advise(any(), eq("127.0.0.1"))).willReturn(new ArchitectureAdviceDomain("Añade una cola.", List.of(
                new ArchitectureAdviceDomain.Recommendation("Desacopla con una cola", List.of("Absorbe picos"), List.of("Más piezas que operar"),
                        "terraform", "resource \"aws_sqs_queue\" \"q\" {}",
                        List.of(new ArchitectureAdviceDomain.Addition("queue", null, "Reintentos", "api"),
                                new ArchitectureAdviceDomain.Addition("custom", "IPFS", null, null))))));

        mockMvc.perform(post("/ai/architecture/copilot").contentType(MediaType.APPLICATION_JSON).content(COPILOT_BODY))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.answer").value("Añade una cola."))
                .andExpect(jsonPath("$.recommendations[0].title").value("Desacopla con una cola"))
                .andExpect(jsonPath("$.recommendations[0].pros[0]").value("Absorbe picos"))
                .andExpect(jsonPath("$.recommendations[0].cons[0]").value("Más piezas que operar"))
                .andExpect(jsonPath("$.recommendations[0].snippetLanguage").value("terraform"))
                .andExpect(jsonPath("$.recommendations[0].additions[0].code").value("queue"))
                .andExpect(jsonPath("$.recommendations[0].additions[0].connectFrom").value("api"))
                .andExpect(jsonPath("$.recommendations[0].additions[1].name").value("IPFS"));

        ArgumentCaptor<ArchitectureCopilotUseCase.Question> question = ArgumentCaptor.forClass(ArchitectureCopilotUseCase.Question.class);
        verify(copilotUseCase).advise(question.capture(), eq("127.0.0.1"));
        assertThat(question.getValue().tenantId()).isEqualTo("default-tenant");
        assertThat(question.getValue().prompt()).isEqualTo("¿Cómo la hago más resiliente?");
        assertThat(question.getValue().cloudProvider()).isEqualTo(CloudProviderDomain.AWS);
        assertThat(question.getValue().nodes()).hasSize(1);
    }

    @Test
    void theCopilotReportsItsLimitsAndFailuresAsProblemDetails() throws Exception {
        given(copilotUseCase.advise(any(), any())).willThrow(new RateLimitExceededException(10, Duration.ofSeconds(30)));
        mockMvc.perform(post("/ai/architecture/copilot").contentType(MediaType.APPLICATION_JSON).content(COPILOT_BODY))
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.code").value("RATE_LIMIT_EXCEEDED"));

        org.mockito.BDDMockito.willThrow(new AiServiceUnavailableException("El motor de IA no está disponible")).given(copilotUseCase).advise(any(), any());
        mockMvc.perform(post("/ai/architecture/copilot").contentType(MediaType.APPLICATION_JSON).content(COPILOT_BODY))
                .andExpect(status().isServiceUnavailable());

        org.mockito.BDDMockito.willThrow(new InvalidRequestException("Escribe una pregunta para el copiloto")).given(copilotUseCase).advise(any(), any());
        mockMvc.perform(post("/ai/architecture/copilot").contentType(MediaType.APPLICATION_JSON).content(COPILOT_BODY))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("Escribe una pregunta para el copiloto"));
    }

    @Test
    void anyoneCanAskAndGetsAnswerWithCitations() throws Exception {
        given(ragUseCase.query(RAGQueryDomain.of("default-tenant", "¿Qué caché usa?"), "127.0.0.1"))
                .willReturn(new RAGAnswerDomain("Redis con cache-aside.", List.of(
                        new RAGAnswerDomain.Citation("backend/RedisCacheAdapter.java", "20-45", "class RedisCacheAdapter"))));

        ask("{\"prompt\":\"¿Qué caché usa?\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.answer").value("Redis con cache-aside."))
                .andExpect(jsonPath("$.citations[0].filePath").value("backend/RedisCacheAdapter.java"))
                .andExpect(jsonPath("$.citations[0].lineNumberRange").value("20-45"))
                .andExpect(jsonPath("$.citations[0].codeSnippet").value("class RedisCacheAdapter"));
    }

    @Test
    void blankOrOversizedPromptReturns400WithoutReachingTheUseCase() throws Exception {
        ask("{\"prompt\":\"   \"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
        ask("{\"prompt\":\"" + "a".repeat(RAGQueryDomain.MAX_PROMPT_LENGTH + 1) + "\"}")
                .andExpect(status().isBadRequest());
        ask("{}").andExpect(status().isBadRequest());

        verifyNoInteractions(ragUseCase);
    }

    @Test
    void rateLimitedQuestionReturns429WithRetryAfter() throws Exception {
        given(ragUseCase.query(any(), any())).willThrow(new RateLimitExceededException(10, Duration.ofSeconds(17)));

        ask("{\"prompt\":\"hola\"}")
                .andExpect(status().isTooManyRequests())
                .andExpect(header().string(HttpHeaders.RETRY_AFTER, "17"))
                .andExpect(header().string("X-RateLimit-Limit", "10"))
                .andExpect(jsonPath("$.code").value("RATE_LIMIT_EXCEEDED"));
    }

    @Test
    void providerOutageReturns503() throws Exception {
        given(ragUseCase.query(any(), any())).willThrow(new AiServiceUnavailableException("El motor de IA no está disponible"));

        ask("{\"prompt\":\"hola\"}")
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.code").value("SERVICE_UNAVAILABLE"));
    }

    @Test
    void reindexRequiresAdmin() throws Exception {
        mockMvc.perform(post("/admin/ai/rag/reindex")).andExpect(status().isUnauthorized());
        mockMvc.perform(post("/admin/ai/rag/reindex").header(HttpHeaders.AUTHORIZATION, bearer("ROLE_USER")))
                .andExpect(status().isForbidden());

        verifyNoInteractions(ragIndexingUseCase);
    }

    @Test
    void adminReindexIsAcceptedAndRunsForTheDefaultTenant() throws Exception {
        mockMvc.perform(post("/admin/ai/rag/reindex").header(HttpHeaders.AUTHORIZATION, bearer("ROLE_ADMIN")))
                .andExpect(status().isAccepted());

        verify(ragIndexingUseCase).reindex("default-tenant");
    }

    @Test
    void reindexFailureInBackgroundDoesNotBreakTheResponse() throws Exception {
        given(ragIndexingUseCase.reindex(any())).willThrow(new AiServiceUnavailableException("caído"));

        mockMvc.perform(post("/admin/ai/rag/reindex").header(HttpHeaders.AUTHORIZATION, bearer("ROLE_ADMIN")))
                .andExpect(status().isAccepted());
    }

    private ResultActions ask(String body) throws Exception {
        return mockMvc.perform(post("/ai/rag/query").contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private static String bearer(String role) {
        return "Bearer " + Jwts.builder()
                .subject("usr_test")
                .claim("roles", List.of(role))
                .expiration(Date.from(Instant.now().plusSeconds(300)))
                .signWith(Keys.hmacShaKeyFor(Decoders.BASE64.decode(SECRET)))
                .compact();
    }
}
