package dev.portfolio.infrastructure.adapter.in.web;

import com.jayway.jsonpath.JsonPath;
import dev.portfolio.application.port.out.ArchitectureProjectRepositoryPort;
import dev.portfolio.application.port.out.ArticleRepositoryPort;
import dev.portfolio.application.port.out.CachePort;
import dev.portfolio.application.port.out.CareerStoryPort;
import dev.portfolio.application.port.out.CvRendererPort;
import dev.portfolio.application.port.out.ProfilePhotoPort;
import dev.portfolio.application.port.out.CloudCatalogRepositoryPort;
import dev.portfolio.application.port.out.CodeSourcePort;
import dev.portfolio.application.port.out.GeminiAiPort;
import dev.portfolio.application.port.out.ProjectRepositoryPort;
import dev.portfolio.application.port.out.RateLimiterPort;
import dev.portfolio.application.port.out.SystemProbePort;
import dev.portfolio.application.port.out.TechnologyRepositoryPort;
import dev.portfolio.application.port.out.VectorRepositoryPort;
import dev.portfolio.domain.model.RateLimitDecision;
import dev.portfolio.domain.model.RateLimitPolicy;
import dev.portfolio.infrastructure.adapter.in.web.controller.AdminTechnologiesController;
import dev.portfolio.infrastructure.adapter.in.web.controller.AuthController;
import dev.portfolio.infrastructure.adapter.in.web.error.ProblemDetailFactory;
import dev.portfolio.infrastructure.adapter.in.web.mapper.AuthWebMapperImpl;
import dev.portfolio.infrastructure.adapter.in.web.mapper.TechnologyWebMapperImpl;
import dev.portfolio.infrastructure.config.SecurityConfig;
import dev.portfolio.infrastructure.config.UseCaseConfig;
import dev.portfolio.infrastructure.security.ConfiguredClientAuthenticator;
import dev.portfolio.infrastructure.security.JwtTokenService;
import dev.portfolio.infrastructure.security.ProblemDetailSecurityHandler;
import org.junit.jupiter.api.BeforeEach;
import dev.portfolio.application.port.out.TelemetryPort;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import java.time.Duration;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Usa los casos de uso reales (UseCaseConfig) para probar el ciclo completo:
 * emitir un token en /auth/token y usarlo contra un endpoint protegido.
 */
@WebMvcTest(controllers = {AuthController.class, AdminTechnologiesController.class})
@Import({
        SecurityConfig.class,
        UseCaseConfig.class,
        JwtTokenService.class,
        ConfiguredClientAuthenticator.class,
        ProblemDetailSecurityHandler.class,
        ProblemDetailFactory.class,
        AuthWebMapperImpl.class,
        TechnologyWebMapperImpl.class
})
@TestPropertySource(properties = {
        "security.jwt.secret=dGVzdC1vbmx5LWhtYWMta2V5LTAxMjM0NTY3ODlhYmNkZWY=",
        "security.jwt.expiration=15m",
        "security.admin-client.id=admin-ui",
        "security.admin-client.secret=s3cret-for-tests",
        "security.cors.allowed-origins=http://localhost:4200,https://example.com",
        "security.rate-limit.auth-token.max-requests=5",
        "security.rate-limit.auth-token.window=1m",
        "security.rate-limit.rag-query.max-requests=10",
        "security.rate-limit.rag-query.window=1m",
        "security.rate-limit.rag-query-global.max-requests=500",
        "security.rate-limit.rag-query-global.window=24h",
        "security.rate-limit.terraform.max-requests=30",
        "security.rate-limit.terraform.window=1m"
})
class AuthApiTest {

    private static final String FRONTEND_ORIGIN = "http://localhost:4200";

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private TelemetryPort telemetryPort;

    @MockBean
    private TechnologyRepositoryPort technologyRepositoryPort;

    @MockBean
    private ProjectRepositoryPort projectRepositoryPort;

    @MockBean
    private CachePort cachePort;

    @MockBean
    private RateLimiterPort rateLimiterPort;

    @MockBean
    private GeminiAiPort geminiAiPort;

    @MockBean
    private CodeSourcePort codeSourcePort;

    @MockBean
    private SystemProbePort systemProbePort;

    @MockBean
    private CareerStoryPort careerStoryPort;

    @MockBean
    private CvRendererPort cvRendererPort;

    @MockBean
    private ProfilePhotoPort profilePhotoPort;

    @MockBean
    private ArchitectureProjectRepositoryPort architectureProjectRepositoryPort;

    @MockBean
    private CloudCatalogRepositoryPort cloudCatalogRepositoryPort;

    @MockBean
    private ArticleRepositoryPort articleRepositoryPort;

    @MockBean
    private VectorRepositoryPort vectorRepositoryPort;

    @BeforeEach
    void allowRequestsByDefault() {
        given(rateLimiterPort.tryAcquire(any(), any()))
                .willReturn(new RateLimitDecision(true, 5, 4, Duration.ofSeconds(60)));
    }

    @Test
    void validCredentialsIssueTokenThatOpensAdminEndpoints() throws Exception {
        String body = requestToken("admin-ui", "s3cret-for-tests", "client_credentials")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accessToken").isNotEmpty())
                .andExpect(jsonPath("$.expiresInSeconds").value(900))
                .andReturn().getResponse().getContentAsString();
        String token = JsonPath.read(body, "$.accessToken");

        mockMvc.perform(get("/admin/technologies").header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
                .andExpect(status().isOk());

        mockMvc.perform(get("/auth/validate").header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.active").value(true))
                .andExpect(jsonPath("$.subject").value("admin-ui"))
                .andExpect(jsonPath("$.roles[0]").value("ROLE_ADMIN"));
    }

    @Test
    void wrongSecretReturns401WithoutLeakingIt() throws Exception {
        requestToken("admin-ui", "wrong-secret", "client_credentials")
                .andExpect(status().isUnauthorized())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.code").value("INVALID_CREDENTIALS"))
                .andExpect(content().string(not(containsString("wrong-secret"))));
    }

    @Test
    void exceedingRateLimitReturns429EvenWithValidCredentials() throws Exception {
        given(rateLimiterPort.tryAcquire(any(), any()))
                .willReturn(new RateLimitDecision(false, 5, 0, Duration.ofMillis(41_200)));

        requestTokenFrom(FRONTEND_ORIGIN)
                .andExpect(status().isTooManyRequests())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(header().string("X-RateLimit-Limit", "5"))
                .andExpect(header().string("X-RateLimit-Remaining", "0"))
                .andExpect(header().string(HttpHeaders.RETRY_AFTER, "42"))
                .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_EXPOSE_HEADERS, containsString("Retry-After")))
                .andExpect(jsonPath("$.status").value(429))
                .andExpect(jsonPath("$.code").value("RATE_LIMIT_EXCEEDED"));
    }

    @Test
    void rateLimitIsKeyedByClientAddressWithConfiguredPolicy() throws Exception {
        requestToken("admin-ui", "wrong-secret", "client_credentials");

        verify(rateLimiterPort).tryAcquire(
                eq("auth-token:127.0.0.1"), eq(new RateLimitPolicy(5, Duration.ofMinutes(1))));
    }

    @Test
    void otherEndpointsAreNotRateLimited() throws Exception {
        mockMvc.perform(get("/auth/validate"));

        verifyNoInteractions(rateLimiterPort);
    }

    @Test
    void unknownClientReturns401() throws Exception {
        requestToken("someone-else", "s3cret-for-tests", "client_credentials")
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("INVALID_CREDENTIALS"));
    }

    @Test
    void unsupportedGrantTypeReturns400() throws Exception {
        requestToken("admin-ui", "s3cret-for-tests", "password")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("UNSUPPORTED_GRANT_TYPE"));
    }

    @Test
    void missingFieldReturns400WithFieldErrors() throws Exception {
        mockMvc.perform(post("/auth/token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"clientId":"admin-ui","grantType":"client_credentials"}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.errors[0].field").value("clientSecret"))
                .andExpect(jsonPath("$.errors[0].code").value("NotNull"));
    }

    @Test
    void malformedJsonReturns400() throws Exception {
        mockMvc.perform(post("/auth/token").contentType(MediaType.APPLICATION_JSON).content("{not json"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("MALFORMED_REQUEST"));
    }

    @Test
    void validateWithoutTokenReturns401() throws Exception {
        mockMvc.perform(get("/auth/validate"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
    }

    @Test
    void preflightFromAllowedOriginSucceedsWithoutToken() throws Exception {
        mockMvc.perform(options("/admin/technologies")
                        .header(HttpHeaders.ORIGIN, FRONTEND_ORIGIN)
                        .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "PUT")
                        .header(HttpHeaders.ACCESS_CONTROL_REQUEST_HEADERS, "authorization,content-type"))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, FRONTEND_ORIGIN))
                .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_HEADERS, containsString("authorization")));
    }

    @Test
    void preflightFromUnknownOriginIsRejected() throws Exception {
        mockMvc.perform(options("/admin/technologies")
                        .header(HttpHeaders.ORIGIN, "https://evil.example")
                        .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "GET"))
                .andExpect(status().isForbidden())
                .andExpect(header().doesNotExist(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN));
    }

    @Test
    void corsHeadersArePresentOnActualResponses() throws Exception {
        requestTokenFrom(FRONTEND_ORIGIN)
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, FRONTEND_ORIGIN));
    }

    private ResultActions requestToken(String clientId, String clientSecret, String grantType) throws Exception {
        return mockMvc.perform(post("/auth/token")
                .contentType(MediaType.APPLICATION_JSON)
                .content(tokenRequest(clientId, clientSecret, grantType)));
    }

    private ResultActions requestTokenFrom(String origin) throws Exception {
        return mockMvc.perform(post("/auth/token")
                .header(HttpHeaders.ORIGIN, origin)
                .contentType(MediaType.APPLICATION_JSON)
                .content(tokenRequest("admin-ui", "s3cret-for-tests", "client_credentials")));
    }

    private static String tokenRequest(String clientId, String clientSecret, String grantType) {
        return """
                {"clientId":"%s","clientSecret":"%s","grantType":"%s"}
                """.formatted(clientId, clientSecret, grantType);
    }
}
