package dev.portfolio.infrastructure.adapter.in.web;

import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import java.nio.charset.StandardCharsets;
import dev.portfolio.domain.model.CvType;
import dev.portfolio.domain.model.CvLanguage;
import dev.portfolio.domain.model.CvDocumentDomain;
import dev.portfolio.application.port.in.ArticleUseCase;
import dev.portfolio.application.port.in.CareerUseCase;
import dev.portfolio.application.port.in.CvUseCase;
import dev.portfolio.application.port.in.ProjectUseCase;
import dev.portfolio.application.port.in.TechnologyUseCase;
import dev.portfolio.domain.exception.ResourceNotFoundException;
import dev.portfolio.domain.exception.InvalidRequestException;
import dev.portfolio.domain.model.ArticleDomain;
import dev.portfolio.domain.model.CareerMilestoneDomain;
import dev.portfolio.domain.model.ProjectDomain;
import dev.portfolio.domain.model.TechnologyDomain;
import dev.portfolio.domain.model.TelemetryEventType;
import dev.portfolio.infrastructure.adapter.in.web.controller.AdminArticlesController;
import dev.portfolio.infrastructure.adapter.in.web.controller.AdminProjectsController;
import dev.portfolio.infrastructure.adapter.in.web.controller.AdminTechnologiesController;
import dev.portfolio.infrastructure.adapter.in.web.controller.PublicCatalogController;
import dev.portfolio.infrastructure.adapter.in.web.error.ProblemDetailFactory;
import dev.portfolio.infrastructure.adapter.in.web.mapper.ArticleWebMapperImpl;
import dev.portfolio.infrastructure.adapter.in.web.mapper.CareerWebMapperImpl;
import dev.portfolio.infrastructure.adapter.in.web.mapper.ProjectWebMapperImpl;
import dev.portfolio.infrastructure.adapter.in.web.mapper.TechnologyWebMapperImpl;
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
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.util.Date;
import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.BDDMockito.willThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(controllers = {
        AdminTechnologiesController.class, AdminProjectsController.class, AdminArticlesController.class,
        PublicCatalogController.class})
@Import({
        SecurityConfig.class,
        JwtTokenService.class,
        ProblemDetailSecurityHandler.class,
        ProblemDetailFactory.class,
        TechnologyWebMapperImpl.class,
        ProjectWebMapperImpl.class,
        CareerWebMapperImpl.class,
        ArticleWebMapperImpl.class
})
@TestPropertySource(properties = "security.jwt.secret=" + AdminApiSecurityTest.SECRET)
class AdminApiSecurityTest {

    static final String SECRET = "dGVzdC1vbmx5LWhtYWMta2V5LTAxMjM0NTY3ODlhYmNkZWY=";

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private TelemetryPort telemetryPort;

    @MockBean
    private TechnologyUseCase technologyUseCase;

    @MockBean
    private ProjectUseCase projectUseCase;

    @MockBean
    private CareerUseCase careerUseCase;

    @MockBean
    private ArticleUseCase articleUseCase;

    @MockBean
    private CvUseCase cvUseCase;

    @Test
    void adminEndpointWithoutTokenReturns401ProblemDetail() throws Exception {
        mockMvc.perform(get("/admin/technologies"))
                .andExpect(status().isUnauthorized())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.status").value(401))
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"))
                .andExpect(jsonPath("$.instance").value("/admin/technologies"))
                .andExpect(jsonPath("$.timestamp").exists())
                .andExpect(jsonPath("$.traceId").exists());
    }

    @Test
    void malformedTokenReturns401() throws Exception {
        mockMvc.perform(get("/admin/technologies").header(HttpHeaders.AUTHORIZATION, "Bearer not-a-jwt"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
    }

    @Test
    void expiredTokenReturns401() throws Exception {
        String expired = token("ROLE_ADMIN", Instant.now().minusSeconds(60));

        mockMvc.perform(get("/admin/technologies").header(HttpHeaders.AUTHORIZATION, "Bearer " + expired))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void tokenSignedWithAnotherKeyReturns401() throws Exception {
        String forged = Jwts.builder()
                .subject("intruder")
                .claim("roles", List.of("ROLE_ADMIN"))
                .expiration(Date.from(Instant.now().plusSeconds(300)))
                .signWith(Keys.hmacShaKeyFor("another-key-another-key-another-key!".getBytes()))
                .compact();

        mockMvc.perform(get("/admin/technologies").header(HttpHeaders.AUTHORIZATION, "Bearer " + forged))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void tokenWithoutAdminRoleReturns403ProblemDetail() throws Exception {
        mockMvc.perform(get("/admin/technologies").header(HttpHeaders.AUTHORIZATION, bearer("ROLE_USER")))
                .andExpect(status().isForbidden())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.code").value("FORBIDDEN"));
    }

    @Test
    void adminTokenListsTechnologies() throws Exception {
        given(technologyUseCase.findAll()).willReturn(List.of(
                new TechnologyDomain("tech-1", "Java 21", "Backend", "Expert", "https://cdn/java.svg", true)));

        mockMvc.perform(get("/admin/technologies").header(HttpHeaders.AUTHORIZATION, bearer("ROLE_ADMIN")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value("tech-1"))
                .andExpect(jsonPath("$[0].isFeatured").value(true));

        // La telemetría registra la verificación con el rol, sin el sujeto del token.
        verify(telemetryPort).publish(TelemetryEventType.JWT_VERIFIED, "ROLE_ADMIN");
    }

    @Test
    void rejectedTokensAreNotReportedAsVerified() throws Exception {
        mockMvc.perform(get("/admin/technologies").header(HttpHeaders.AUTHORIZATION, "Bearer not-a-jwt"))
                .andExpect(status().isUnauthorized());

        verifyNoInteractions(telemetryPort);
    }

    @Test
    void adminTokenCreatesProject() throws Exception {
        given(projectUseCase.create(any()))
                .willAnswer(invocation -> invocation.<ProjectDomain>getArgument(0).withId("prj-1"));

        mockMvc.perform(post("/admin/projects")
                        .header(HttpHeaders.AUTHORIZATION, bearer("ROLE_ADMIN"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"title":"SaaS","summary":"Demo","githubRepoUrl":"https://github.com/u/r","technologiesUsed":["tech-1"]}
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value("prj-1"))
                .andExpect(jsonPath("$.technologiesUsed[0]").value("tech-1"));
    }

    @Test
    void missingResourceReturns404ProblemDetail() throws Exception {
        willThrow(new ResourceNotFoundException("Technology", "nope")).given(technologyUseCase).delete("nope");

        mockMvc.perform(delete("/admin/technologies/nope").header(HttpHeaders.AUTHORIZATION, bearer("ROLE_ADMIN")))
                .andExpect(status().isNotFound())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.type").value("https://api.example.com/saas-portfolio/errors/resource-not-found"))
                .andExpect(jsonPath("$.title").value("Recurso no encontrado"))
                .andExpect(jsonPath("$.status").value(404))
                .andExpect(jsonPath("$.code").value("RESOURCE_NOT_FOUND"))
                .andExpect(jsonPath("$.instance").value("/admin/technologies/nope"));
    }

    @Test
    void publicCatalogIsServedWithoutToken() throws Exception {
        given(technologyUseCase.findAll()).willReturn(List.of(
                new TechnologyDomain("tech-1", "Java 21", "Backend", "Expert", "https://cdn/java.svg", true)));
        given(projectUseCase.findAll()).willReturn(List.of(new ProjectDomain(
                "prj-1", "SaaS Portfolio", "Plataforma", "https://github.com/u/r", null, null, List.of("tech-1"))));

        mockMvc.perform(get("/public/technologies"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].name").value("Java 21"));
        mockMvc.perform(get("/public/projects"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].title").value("SaaS Portfolio"))
                .andExpect(jsonPath("$[0].technologiesUsed[0]").value("tech-1"));
    }

    @Test
    void careerTimelineIsServedWithoutToken() throws Exception {
        given(careerUseCase.timeline(dev.portfolio.domain.model.CvLanguage.ES)).willReturn(List.of(new CareerMilestoneDomain(
                "2023 - 2025", "Plataforma de pagos", "Staff Engineer", "Acme",
                List.of("Java 21", "PostgreSQL"), "Rediseño del núcleo transaccional.")));

        mockMvc.perform(get("/public/career-timeline"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].period").value("2023 - 2025"))
                .andExpect(jsonPath("$[0].title").value("Plataforma de pagos"))
                .andExpect(jsonPath("$[0].role").value("Staff Engineer"))
                .andExpect(jsonPath("$[0].organization").value("Acme"))
                .andExpect(jsonPath("$[0].technologies[1]").value("PostgreSQL"))
                .andExpect(jsonPath("$[0].summary").value("Rediseño del núcleo transaccional."));
    }

    @Test
    void careerTimelineIsServedInTheLanguageAskedForAndRejectsOthers() throws Exception {
        given(careerUseCase.timeline(dev.portfolio.domain.model.CvLanguage.EN)).willReturn(List.of(new CareerMilestoneDomain(
                "2023 - 2025", "Payments platform", "Staff Engineer", "Acme", List.of("Java 21"), "Rebuilt the core.")));

        mockMvc.perform(get("/public/career-timeline").param("lang", "en"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].title").value("Payments platform"));
        mockMvc.perform(get("/public/career-timeline").param("lang", "fr"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void publishedArticlesArePublicNewestFirst() throws Exception {
        given(articleUseCase.findAll()).willReturn(List.of(new ArticleDomain(
                "art-1", "Cache-aside resiliente", "cache-aside-resiliente", "# Contenido",
                java.time.Instant.parse("2026-10-01T10:00:00Z"))));

        mockMvc.perform(get("/public/articles"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].slug").value("cache-aside-resiliente"))
                .andExpect(jsonPath("$[0].title").value("Cache-aside resiliente"))
                .andExpect(jsonPath("$[0].contentMarkdown").value("# Contenido"))
                .andExpect(jsonPath("$[0].publishedAt").value("2026-10-01T10:00:00Z"));
    }

    @Test
    void onlyAdminsCanPublishArticles() throws Exception {
        String body = """
                {"title":"Hexagonal en la práctica","slug":"hexagonal-en-la-practica","contentMarkdown":"# Hola"}
                """;
        given(articleUseCase.publish("Hexagonal en la práctica", "hexagonal-en-la-practica", "# Hola"))
                .willReturn(new ArticleDomain("art-2", "Hexagonal en la práctica", "hexagonal-en-la-practica",
                        "# Hola", java.time.Instant.parse("2026-10-05T12:00:00Z")));

        mockMvc.perform(post("/admin/articles").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(post("/admin/articles").header(HttpHeaders.AUTHORIZATION, bearer("ROLE_ADMIN"))
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value("art-2"))
                .andExpect(jsonPath("$.slug").value("hexagonal-en-la-practica"));
    }

    @Test
    void rejectedArticleReturns400ProblemDetail() throws Exception {
        given(articleUseCase.publish(any(), any(), any()))
                .willThrow(new InvalidRequestException("Ya existe un artículo con el slug 'repetido'"));

        mockMvc.perform(post("/admin/articles").header(HttpHeaders.AUTHORIZATION, bearer("ROLE_ADMIN"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"t\",\"slug\":\"repetido\",\"contentMarkdown\":\"c\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.detail").value("Ya existe un artículo con el slug 'repetido'"));
    }

    @Test
    void cvDownloadIsPublicAndServesThePdfAsAnAttachment() throws Exception {
        byte[] pdf = "%PDF-1.5 contenido".getBytes(StandardCharsets.UTF_8);
        given(cvUseCase.download(CvLanguage.EN, CvType.SHORT, false))
                .willReturn(new CvDocumentDomain("cv-manuel-cardoza-en-short.pdf", pdf));

        mockMvc.perform(get("/public/cv/download").param("lang", "en").param("type", "short").param("photo", "false"))
                .andExpect(status().isOk())
                .andExpect(content().contentType(MediaType.APPLICATION_PDF))
                .andExpect(header().string(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"cv-manuel-cardoza-en-short.pdf\""))
                .andExpect(content().bytes(pdf));
    }

    @Test
    void cvDownloadDefaultsToTheFullSpanishCvWithPhoto() throws Exception {
        given(cvUseCase.download(CvLanguage.ES, CvType.FULL, true)).willReturn(new CvDocumentDomain("cv.pdf", new byte[] {1}));

        mockMvc.perform(get("/public/cv/download")).andExpect(status().isOk());

        // Por defecto, con foto.
        verify(cvUseCase).download(CvLanguage.ES, CvType.FULL, true);
    }

    @Test
    void cvDownloadRejectsUnknownVariantsAndReportsAMissingTranslation() throws Exception {
        mockMvc.perform(get("/public/cv/download").param("lang", "fr"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.detail").value("Idioma de CV no admitido: 'fr'. Valores: es, en"));
        mockMvc.perform(get("/public/cv/download").param("type", "docx")).andExpect(status().isBadRequest());

        given(cvUseCase.download(CvLanguage.EN, CvType.FULL, true)).willThrow(new ResourceNotFoundException("CV", "en"));
        mockMvc.perform(get("/public/cv/download").param("lang", "en"))
                .andExpect(status().isNotFound())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.code").value("RESOURCE_NOT_FOUND"));
    }

    @Test
    void publicDiagramsAreNotImplementedYet() throws Exception {
        mockMvc.perform(get("/public/architecture/c4/context")).andExpect(status().isNotImplemented());
    }

    private static String bearer(String role) {
        return "Bearer " + token(role, Instant.now().plusSeconds(300));
    }

    private static String token(String role, Instant expiration) {
        return Jwts.builder()
                .subject("usr_test")
                .claim("roles", List.of(role))
                .expiration(Date.from(expiration))
                .signWith(Keys.hmacShaKeyFor(Decoders.BASE64.decode(SECRET)))
                .compact();
    }
}
