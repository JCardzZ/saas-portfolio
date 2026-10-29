package dev.portfolio.infrastructure.adapter.in.web;

import dev.portfolio.application.port.in.SystemHealthUseCase;
import dev.portfolio.application.port.out.TelemetryPort;
import dev.portfolio.domain.exception.SystemUnavailableException;
import dev.portfolio.domain.model.SystemHealthDomain;
import dev.portfolio.domain.model.SystemHealthDomain.CircuitState;
import dev.portfolio.domain.model.SystemHealthDomain.ComponentHealth;
import dev.portfolio.domain.model.SystemTelemetryEvent;
import dev.portfolio.domain.model.TelemetryEventType;
import dev.portfolio.infrastructure.adapter.in.web.controller.TelemetryController;
import dev.portfolio.infrastructure.adapter.in.web.error.ProblemDetailFactory;
import dev.portfolio.infrastructure.adapter.in.web.mapper.HealthWebMapperImpl;
import dev.portfolio.infrastructure.adapter.in.web.mapper.TelemetryWebMapperImpl;
import dev.portfolio.infrastructure.adapter.in.web.sse.TelemetryStreamBroadcaster;
import dev.portfolio.infrastructure.config.SecurityConfig;
import dev.portfolio.infrastructure.security.JwtTokenService;
import dev.portfolio.infrastructure.security.ProblemDetailSecurityHandler;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Duration;
import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;
import static org.mockito.BDDMockito.given;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(controllers = TelemetryController.class)
@Import({
        SecurityConfig.class,
        JwtTokenService.class,
        ProblemDetailSecurityHandler.class,
        ProblemDetailFactory.class,
        HealthWebMapperImpl.class,
        TelemetryWebMapperImpl.class,
        TelemetryStreamBroadcaster.class
})
@TestPropertySource(properties = {
        "security.jwt.secret=dGVzdC1vbmx5LWhtYWMta2V5LTAxMjM0NTY3ODlhYmNkZWY=",
        "release.version=v1.4.0"
})
class TelemetryApiTest {

    private static final ComponentHealth DATABASE_OK = new ComponentHealth(true, "PostgreSQL 16 - Connected");

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private TelemetryStreamBroadcaster broadcaster;

    @MockBean
    private SystemHealthUseCase systemHealthUseCase;

    @MockBean
    private TelemetryPort telemetryPort;

    @Test
    void healthIsPublicAndReportsEveryComponent() throws Exception {
        given(systemHealthUseCase.check()).willReturn(new SystemHealthDomain(
                DATABASE_OK, new ComponentHealth(true, "Redis - Healthy"), CircuitState.CLOSED));

        mockMvc.perform(get("/telemetry/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("UP"))
                .andExpect(jsonPath("$.database").value("PostgreSQL 16 - Connected"))
                .andExpect(jsonPath("$.redisCache").value("Redis - Healthy"))
                .andExpect(jsonPath("$.circuitBreakers.aiEngine").value("CLOSED")
                .andExpect(jsonPath("$.version").value("v1.4.0"));
    }

    @Test
    void openAiCircuitIsReportedAsDegradedButStillAnswers200() throws Exception {
        given(systemHealthUseCase.check()).willReturn(new SystemHealthDomain(
                DATABASE_OK, new ComponentHealth(false, "Redis - Unavailable"), CircuitState.OPEN));

        mockMvc.perform(get("/telemetry/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("DEGRADED"))
                .andExpect(jsonPath("$.redisCache").value("Redis - Unavailable"))
                .andExpect(jsonPath("$.circuitBreakers.aiEngine").value("OPEN"));
    }

    @Test
    void databaseDownReturns503ProblemDetail() throws Exception {
        given(systemHealthUseCase.check())
                .willThrow(new SystemUnavailableException("La base de datos no está disponible"));

        mockMvc.perform(get("/telemetry/health"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.code").value("SERVICE_UNAVAILABLE"))
                .andExpect(jsonPath("$.detail").value("La base de datos no está disponible"));
    }

    @Test
    void liveStreamIsPublicAndDeliversEventsAsServerSentEvents() throws Exception {
        MvcResult stream = mockMvc.perform(get("/telemetry/live-stream").accept(MediaType.TEXT_EVENT_STREAM))
                .andExpect(request().asyncStarted())
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.TEXT_EVENT_STREAM))
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-store"))
                .andReturn();
        assertThat(broadcaster.subscriberCount()).isEqualTo(1);

        broadcaster.onTelemetry(new SystemTelemetryEvent(
                Instant.parse("2026-10-05T10:00:00Z"), TelemetryEventType.CACHE_HIT, "portfolio:projects:all", "trace-9"));

        await().atMost(Duration.ofSeconds(2)).untilAsserted(() ->
                assertThat(stream.getResponse().getContentAsString()).contains("\"eventType\":\"CACHE_HIT\""));
        String body = stream.getResponse().getContentAsString();
        assertThat(body).startsWith(":connected");
        assertThat(body).contains("data:{").contains("\"details\":\"portfolio:projects:all\"")
                .contains("\"traceId\":\"trace-9\"").contains("\"timestamp\":\"2026-10-05T10:00:00Z\"");
    }
}
