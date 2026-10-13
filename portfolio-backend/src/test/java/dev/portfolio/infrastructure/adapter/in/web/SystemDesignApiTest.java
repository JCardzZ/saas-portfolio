package dev.portfolio.infrastructure.adapter.in.web;

import dev.portfolio.application.port.in.SystemDesignUseCase;
import dev.portfolio.application.port.out.FeatureFlags;
import dev.portfolio.application.port.out.TelemetryPort;
import dev.portfolio.domain.exception.InvalidRequestException;
import dev.portfolio.domain.exception.RateLimitExceededException;
import dev.portfolio.domain.model.CloudProviderDomain;
import dev.portfolio.domain.model.FeatureFlagDomain;
import dev.portfolio.domain.model.system.SystemFindingDomain;
import dev.portfolio.infrastructure.adapter.in.web.controller.SystemDesignController;
import dev.portfolio.infrastructure.adapter.in.web.error.GlobalExceptionHandler;
import dev.portfolio.infrastructure.adapter.in.web.error.ProblemDetailFactory;
import dev.portfolio.infrastructure.adapter.in.web.flags.FeatureGateConfig;
import dev.portfolio.infrastructure.adapter.in.web.mapper.SystemDesignWebMapper;
import dev.portfolio.infrastructure.security.JwtTokenService;
import dev.portfolio.infrastructure.security.ProblemDetailSecurityHandler;
import dev.portfolio.infrastructure.config.SecurityConfig;
import dev.portfolio.testsupport.SystemDesignFixture;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Duration;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(controllers = SystemDesignController.class)
@Import({SecurityConfig.class, JwtTokenService.class, ProblemDetailSecurityHandler.class, ProblemDetailFactory.class,
        GlobalExceptionHandler.class, SystemDesignWebMapper.class, FeatureGateConfig.class})
@TestPropertySource(properties = "security.jwt.secret=dGVzdC1vbmx5LWhtYWMta2V5LTAxMjM0NTY3ODlhYmNkZWY=")
class SystemDesignApiTest {

    private static final String BODY = """
            {"cloudProvider":"aws",
             "nodes":[{"id":"api","type":"containers","service":{"aws":"ECS Fargate","gcp":"Cloud Run","azure":"Container Apps"}}],
             "connections":[],
             "system":{"choices":{"client":"web-spa","backend":"go","api":"rest","auth":"jwt-own","database":"postgresql"},
                       "deployments":{"backend":"api"},
                       "nfr":{"rps":800,"availability":99.9,"compliance":["pci"]}},
             "estimatedMonthlyCostUsd":120.5}""";

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private SystemDesignUseCase systemDesign;

    @MockBean
    private FeatureFlags flags;

    @MockBean
    private TelemetryPort telemetryPort;

    @BeforeEach
    void flagOn() {
        given(flags.isEnabled(FeatureFlagDomain.STUDIO_SYSTEM_DESIGN)).willReturn(true);
    }

    @Test
    void theWholeFeatureIsNotThereWhileItsFlagIsOff() throws Exception {
        given(flags.isEnabled(FeatureFlagDomain.STUDIO_SYSTEM_DESIGN)).willReturn(false);

        mockMvc.perform(get("/public/architecture/system-design/catalog"))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("RESOURCE_NOT_FOUND"));
        mockMvc.perform(post("/public/architecture/system-design/evaluate").contentType(MediaType.APPLICATION_JSON).content(BODY))
                .andExpect(status().isNotFound());
        mockMvc.perform(post("/public/architecture/system-design/generate").contentType(MediaType.APPLICATION_JSON).content(BODY))
                .andExpect(status().isNotFound());
    }

    @Test
    void anyoneCanReadTheCatalogOfTheApplicationView() throws Exception {
        given(systemDesign.catalog()).willReturn(SystemDesignFixture.rules());

        mockMvc.perform(get("/public/architecture/system-design/catalog"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.categories.length()").value(9))
                .andExpect(jsonPath("$.categories[2].id").value("api"))
                .andExpect(jsonPath("$.categories[2].options[0].contract").value("openapi"))
                .andExpect(jsonPath("$.categories[4].options[0].deploysOn[0]").value("postgres"))
                .andExpect(jsonPath("$.categories[5].optional").value(true))
                .andExpect(jsonPath("$.requirements[3].field").value("availability"))
                .andExpect(jsonPath("$.requirements[3].choices.length()").value(4))
                .andExpect(jsonPath("$.compliance[0].id").value("pci"))
                // Las reglas no viajan: son cómo decide la plataforma, no lo que se puede elegir.
                .andExpect(jsonPath("$.rules").doesNotExist());
    }

    @Test
    void evaluatesADesignAndReturnsItsFindings() throws Exception {
        given(systemDesign.evaluate(any(), any())).willReturn(List.of(
                new SystemFindingDomain("rps-cache", "nfr", SystemFindingDomain.Severity.WARNING, "cache", null, "Sin caché", "Elige una caché"),
                new SystemFindingDomain("deployment-invalid", "deployment", SystemFindingDomain.Severity.ERROR, "backend", "api", "No se puede", null)));

        mockMvc.perform(post("/public/architecture/system-design/evaluate").contentType(MediaType.APPLICATION_JSON).content(BODY))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.findings.length()").value(2))
                .andExpect(jsonPath("$.findings[0].rule").value("rps-cache"))
                .andExpect(jsonPath("$.findings[0].severity").value("warning"))
                .andExpect(jsonPath("$.findings[0].category").value("cache"))
                .andExpect(jsonPath("$.findings[0].nodeId").doesNotExist())
                .andExpect(jsonPath("$.findings[1].severity").value("error"))
                .andExpect(jsonPath("$.findings[1].nodeId").value("api"))
                .andExpect(jsonPath("$.findings[1].suggestion").doesNotExist());

        ArgumentCaptor<SystemDesignUseCase.Request> request = ArgumentCaptor.forClass(SystemDesignUseCase.Request.class);
        verify(systemDesign).evaluate(request.capture(), any());
        assertThat(request.getValue().provider()).isEqualTo(CloudProviderDomain.AWS);
        assertThat(request.getValue().costUsd()).isEqualTo(120.5);
        assertThat(request.getValue().design().choices()).containsEntry("backend", "go");
        assertThat(request.getValue().design().deployments()).containsEntry("backend", "api");
        assertThat(request.getValue().design().nfr().rps()).isEqualTo(800.0);
        assertThat(request.getValue().design().nfr().availability()).isEqualTo(99.9);
        assertThat(request.getValue().design().nfr().users()).isNull();
        assertThat(request.getValue().design().nfr().compliance()).containsExactly("pci");
    }

    @Test
    void generatesTheFilesForAnyoneWithinTheRateLimit() throws Exception {
        given(systemDesign.generate(any(), any())).willReturn(new SystemDesignUseCase.Bundle(
                List.of(new SystemDesignUseCase.GeneratedFile("openapi.yaml", "yaml", "openapi: 3.0.3\n")), List.of()));

        mockMvc.perform(post("/public/architecture/system-design/generate").contentType(MediaType.APPLICATION_JSON).content(BODY))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.files[0].path").value("openapi.yaml"))
                .andExpect(jsonPath("$.files[0].language").value("yaml"))
                .andExpect(jsonPath("$.files[0].content").value("openapi: 3.0.3\n"))
                .andExpect(jsonPath("$.findings.length()").value(0));

        given(systemDesign.generate(any(), any())).willThrow(new RateLimitExceededException(30, Duration.ofSeconds(20)));
        mockMvc.perform(post("/public/architecture/system-design/generate").contentType(MediaType.APPLICATION_JSON).content(BODY))
                .andExpect(status().isTooManyRequests())
                .andExpect(header().string(HttpHeaders.RETRY_AFTER, "20"));
    }

    @Test
    void rejectsWhatIsNotValid() throws Exception {
        given(systemDesign.evaluate(any(), any())).willThrow(new InvalidRequestException("Opción desconocida en «Backend»: 'cobol'"));

        mockMvc.perform(post("/public/architecture/system-design/evaluate").contentType(MediaType.APPLICATION_JSON).content(BODY))
                .andExpect(status().isBadRequest());
        // Sin diseño, o en una nube que no existe (Oracle Cloud, con su flag apagada, tampoco).
        mockMvc.perform(post("/public/architecture/system-design/evaluate").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"cloudProvider\":\"aws\",\"nodes\":[],\"connections\":[]}"))
                .andExpect(status().isBadRequest());
        mockMvc.perform(post("/public/architecture/system-design/evaluate").contentType(MediaType.APPLICATION_JSON)
                        .content(BODY.replace("\"cloudProvider\":\"aws\"", "\"cloudProvider\":\"oci\"")))
                .andExpect(status().isBadRequest());
    }
}
