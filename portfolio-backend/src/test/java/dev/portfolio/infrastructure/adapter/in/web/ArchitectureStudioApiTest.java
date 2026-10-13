package dev.portfolio.infrastructure.adapter.in.web;

import dev.portfolio.domain.model.pricing.SkuPricing;
import dev.portfolio.domain.model.pricing.PricingUnit;
import dev.portfolio.domain.model.pricing.PricingStatus;
import dev.portfolio.domain.model.pricing.PriceQuote;
import dev.portfolio.domain.model.pricing.Money;
import dev.portfolio.application.port.in.PricingUseCase;
import dev.portfolio.application.port.in.ArchitectureProjectUseCase;
import dev.portfolio.application.port.in.ArchitectureProjectUseCase.Draft;
import dev.portfolio.application.port.in.CloudCatalogUseCase;
import dev.portfolio.application.port.in.TerraformUseCase;
import dev.portfolio.domain.model.CloudCatalogItemDomain;
import java.math.BigDecimal;
import java.util.Optional;
import dev.portfolio.application.port.out.TelemetryPort;
import dev.portfolio.domain.exception.InvalidRequestException;
import dev.portfolio.domain.exception.RateLimitExceededException;
import dev.portfolio.domain.exception.ResourceNotFoundException;
import dev.portfolio.domain.model.ArchitectureProjectDomain;
import dev.portfolio.domain.model.CloudProviderDomain;
import dev.portfolio.domain.model.TerraformBundleDomain;
import dev.portfolio.infrastructure.adapter.in.web.controller.ArchitectureStudioController;
import dev.portfolio.infrastructure.adapter.in.web.error.GlobalExceptionHandler;
import dev.portfolio.infrastructure.adapter.in.web.error.ProblemDetailFactory;
import dev.portfolio.infrastructure.adapter.in.web.mapper.ArchitectureWebMapper;
import dev.portfolio.infrastructure.config.SecurityConfig;
import dev.portfolio.infrastructure.security.JwtTokenService;
import dev.portfolio.infrastructure.security.ProblemDetailSecurityHandler;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;
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
import java.time.Instant;
import java.util.Date;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(controllers = ArchitectureStudioController.class)
@Import({SecurityConfig.class, JwtTokenService.class, ProblemDetailSecurityHandler.class, ProblemDetailFactory.class,
        GlobalExceptionHandler.class, ArchitectureWebMapper.class})
@TestPropertySource(properties = "security.jwt.secret=" + ArchitectureStudioApiTest.SECRET)
class ArchitectureStudioApiTest {

    static final String SECRET = "dGVzdC1vbmx5LWhtYWMta2V5LTAxMjM0NTY3ODlhYmNkZWY=";
    private static final Instant CREATED = Instant.parse("2026-10-05T12:00:00Z");
    private static final ArchitectureProjectDomain PRESET = new ArchitectureProjectDomain(
            "core-banking", "Core bancario", "Escenario ilustrativo", CloudProviderDomain.AWS,
            List.of(Map.of("id", "api", "x", 556)), List.of(Map.of("from", "api", "to", "mq")), List.of(Map.of("id", "cloud")), true, CREATED);
    private static final String BODY = """
            {"title":"Mi arquitectura","description":"d","cloudProvider":"gcp",
             "nodes":[{"id":"api","service":{"aws":"ECS","gcp":"Cloud Run","azure":"Container Apps"}}],
             "connections":[{"from":"api","to":"api"}],"zones":[]}""";

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private ArchitectureProjectUseCase projects;

    @MockBean
    private TerraformUseCase terraform;

    @MockBean
    private CloudCatalogUseCase catalog;

    @MockBean
    private PricingUseCase pricing;

    @MockBean
    private TelemetryPort telemetryPort;

    @MockBean
    private dev.portfolio.application.port.in.FeatureFlagUseCase featureFlags;

    private static String adminToken() {
        return "Bearer " + Jwts.builder().subject("admin-ui").claim("roles", List.of("ROLE_ADMIN"))
                .expiration(Date.from(Instant.now().plusSeconds(300)))
                .signWith(Keys.hmacShaKeyFor(Decoders.BASE64.decode(SECRET))).compact();
    }

    @Test
    void anyoneCanListTheProjectsWithoutTheirGraph() throws Exception {
        given(projects.findAll()).willReturn(List.of(PRESET));

        mockMvc.perform(get("/public/architecture/projects"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value("core-banking"))
                .andExpect(jsonPath("$[0].cloudProvider").value("aws"))
                .andExpect(jsonPath("$[0].isPreset").value(true))
                .andExpect(jsonPath("$[0].createdAt").value("2026-10-05T12:00:00Z"))
                .andExpect(jsonPath("$[0].nodes").doesNotExist());
    }

    @Test
    void anyoneCanLoadAProjectWithItsWholeGraph() throws Exception {
        given(projects.findById("core-banking")).willReturn(PRESET);
        given(projects.findById("nope")).willThrow(new ResourceNotFoundException("ArchitectureProject", "nope"));

        mockMvc.perform(get("/public/architecture/projects/core-banking"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("Core bancario"))
                .andExpect(jsonPath("$.nodes[0].id").value("api"))
                .andExpect(jsonPath("$.nodes[0].x").value(556))
                .andExpect(jsonPath("$.connections[0].to").value("mq"))
                .andExpect(jsonPath("$.zones[0].id").value("cloud"))
                // Sin diagnósticos (flag apagada) el campo no viaja.
                .andExpect(jsonPath("$.diagnostics").doesNotExist());

        given(projects.diagnose(PRESET.nodes(), PRESET.connections())).willReturn(List.of(
                new dev.portfolio.domain.model.GraphDiagnosticDomain("api", "placement", dev.portfolio.domain.model.GraphDiagnosticDomain.Severity.WARNING,
                        "Riesgo de seguridad", "Muévela a una subred privada", null, null),
                new dev.portfolio.domain.model.GraphDiagnosticDomain("mq", "connection", dev.portfolio.domain.model.GraphDiagnosticDomain.Severity.ERROR,
                        "No permitida", null, "api", "mq")));
        mockMvc.perform(get("/public/architecture/projects/core-banking"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.diagnostics.length()").value(2))
                .andExpect(jsonPath("$.diagnostics[0].nodeId").value("api"))
                .andExpect(jsonPath("$.diagnostics[0].rule").value("placement"))
                .andExpect(jsonPath("$.diagnostics[0].severity").value("warning"))
                .andExpect(jsonPath("$.diagnostics[0].suggestion").value("Muévela a una subred privada"))
                .andExpect(jsonPath("$.diagnostics[0].from").doesNotExist())
                .andExpect(jsonPath("$.diagnostics[1].severity").value("error"))
                .andExpect(jsonPath("$.diagnostics[1].from").value("api"))
                .andExpect(jsonPath("$.diagnostics[1].suggestion").doesNotExist());
        mockMvc.perform(get("/public/architecture/projects/nope"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("RESOURCE_NOT_FOUND"));
    }

    @Test
    void savingRequiresAnAdministratorAndThePublicPathsCannotWrite() throws Exception {
        // Lo guardado se sirve a todos los visitantes: nadie anónimo puede escribirlo.
        mockMvc.perform(post("/admin/architecture/projects").contentType(MediaType.APPLICATION_JSON).content(BODY))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(put("/admin/architecture/projects/abc").contentType(MediaType.APPLICATION_JSON).content(BODY))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(post("/public/architecture/projects").contentType(MediaType.APPLICATION_JSON).content(BODY))
                .andExpect(status().is4xxClientError());
        mockMvc.perform(put("/public/architecture/projects/core-banking").contentType(MediaType.APPLICATION_JSON).content(BODY))
                .andExpect(status().is4xxClientError());
        mockMvc.perform(delete("/public/architecture/projects/core-banking")).andExpect(status().is4xxClientError());
        verifyNoInteractions(projects);
    }

    @Test
    void anAdministratorSavesAndUpdatesProjects() throws Exception {
        ArchitectureProjectDomain saved = new ArchitectureProjectDomain("id-1", "Mi arquitectura", "d", CloudProviderDomain.GCP,
                List.of(Map.of("id", "api")), List.of(), List.of(), false, CREATED);
        given(projects.create(any())).willReturn(saved);
        given(projects.update(eq("id-1"), any())).willReturn(saved);

        mockMvc.perform(post("/admin/architecture/projects").header(HttpHeaders.AUTHORIZATION, adminToken())
                        .contentType(MediaType.APPLICATION_JSON).content(BODY))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value("id-1"))
                .andExpect(jsonPath("$.isPreset").value(false));

        ArgumentCaptor<Draft> draft = ArgumentCaptor.forClass(Draft.class);
        verify(projects).create(draft.capture());
        assertThat(draft.getValue().title()).isEqualTo("Mi arquitectura");
        assertThat(draft.getValue().cloudProvider()).isEqualTo(CloudProviderDomain.GCP);
        assertThat(draft.getValue().nodes().get(0)).containsEntry("id", "api")
                .containsEntry("service", Map.of("aws", "ECS", "gcp", "Cloud Run", "azure", "Container Apps"));

        mockMvc.perform(put("/admin/architecture/projects/id-1").header(HttpHeaders.AUTHORIZATION, adminToken())
                        .contentType(MediaType.APPLICATION_JSON).content(BODY))
                .andExpect(status().isOk());
    }

    @Test
    void presetsAndInvalidProjectsAreRejectedWithAProblemDetail() throws Exception {
        given(projects.update(eq("core-banking"), any())).willThrow(new InvalidRequestException("Las plantillas no se pueden modificar"));

        mockMvc.perform(put("/admin/architecture/projects/core-banking").header(HttpHeaders.AUTHORIZATION, adminToken())
                        .contentType(MediaType.APPLICATION_JSON).content(BODY))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.detail").value("Las plantillas no se pueden modificar"));
        mockMvc.perform(post("/admin/architecture/projects").header(HttpHeaders.AUTHORIZATION, adminToken())
                        .contentType(MediaType.APPLICATION_JSON).content(BODY.replace("\"gcp\"", "\"oracle\"")))
                .andExpect(status().isBadRequest());
    }

    @Test
    void anyoneCanReadTheCatalogWholeOrForOneCloud() throws Exception {
        CloudCatalogItemDomain apigee = new CloudCatalogItemDomain("gcp:api-gateway", CloudProviderDomain.GCP, "api-gateway", "Apigee",
                "api-management", new BigDecimal("365.00"), true);
        given(catalog.find(Optional.empty())).willReturn(List.of(apigee));
        given(catalog.find(Optional.of(CloudProviderDomain.GCP))).willReturn(List.of(apigee));

        mockMvc.perform(get("/public/architecture/catalog"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value("gcp:api-gateway"))
                .andExpect(jsonPath("$[0].provider").value("gcp"))
                .andExpect(jsonPath("$[0].code").value("api-gateway"))
                .andExpect(jsonPath("$[0].name").value("Apigee"))
                .andExpect(jsonPath("$[0].category").value("api-management"))
                .andExpect(jsonPath("$[0].defaultMonthlyCost").value(365.0))
                .andExpect(jsonPath("$[0].isEnterprise").value(true));
        mockMvc.perform(get("/public/architecture/catalog").param("provider", "gcp")).andExpect(status().isOk());
        verify(catalog).find(Optional.of(CloudProviderDomain.GCP));

        mockMvc.perform(get("/public/architecture/catalog").param("provider", "oracle"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
    }

    @Test
    void terraformIsCompiledForAnyoneWithinTheRateLimit() throws Exception {
        given(terraform.generate(eq(CloudProviderDomain.GCP), any(), any(), any()))
                .willReturn(new TerraformBundleDomain("provider \"google\" {}", "variable \"region\" {}"));

        mockMvc.perform(post("/public/architecture/generate-terraform").contentType(MediaType.APPLICATION_JSON).content(BODY))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.mainTf").value("provider \"google\" {}"))
                .andExpect(jsonPath("$.variablesTf").value("variable \"region\" {}"));

        given(terraform.generate(any(), any(), any(), any())).willThrow(new RateLimitExceededException(30, Duration.ofSeconds(20)));
        mockMvc.perform(post("/public/architecture/generate-terraform").contentType(MediaType.APPLICATION_JSON).content(BODY))
                .andExpect(status().isTooManyRequests())
                .andExpect(header().string(HttpHeaders.RETRY_AFTER, "20"))
                .andExpect(jsonPath("$.code").value("RATE_LIMIT_EXCEEDED"));
    }

    @Test
    void aProjectCarriesItsSystemDesignWhenItHasOne() throws Exception {
        dev.portfolio.domain.model.system.SystemDesignDomain system = new dev.portfolio.domain.model.system.SystemDesignDomain(
                java.util.Map.of("backend", "go"), java.util.Map.of("backend", "api"),
                new dev.portfolio.domain.model.system.SystemDesignDomain.NonFunctional(null, 800.0, null, 99.9, null, List.of("pci")));
        given(projects.findById("with-system")).willReturn(new ArchitectureProjectDomain("with-system", "Con sistema", null, CloudProviderDomain.AWS,
                PRESET.nodes(), PRESET.connections(), PRESET.zones(), system, false, CREATED));
        given(projects.findById("core-banking")).willReturn(PRESET);

        mockMvc.perform(get("/public/architecture/projects/with-system"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.system.choices.backend").value("go"))
                .andExpect(jsonPath("$.system.deployments.backend").value("api"))
                .andExpect(jsonPath("$.system.nfr.rps").value(800.0))
                .andExpect(jsonPath("$.system.nfr.availability").value(99.9))
                .andExpect(jsonPath("$.system.nfr.users").doesNotExist())
                .andExpect(jsonPath("$.system.nfr.compliance[0]").value("pci"));
        // Sin diseño, el campo no viaja: la respuesta es la de siempre.
        mockMvc.perform(get("/public/architecture/projects/core-banking"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.system").doesNotExist());

        given(projects.create(any())).willReturn(PRESET);
        String withSystem = BODY.replace("\"zones\":[]", "\"zones\":[],\"system\":{\"choices\":{\"backend\":\"node\"},\"deployments\":{},\"nfr\":{\"budgetUsd\":300}}");
        mockMvc.perform(post("/admin/architecture/projects").header(HttpHeaders.AUTHORIZATION, adminToken())
                        .contentType(MediaType.APPLICATION_JSON).content(withSystem))
                .andExpect(status().isCreated());
        org.mockito.ArgumentCaptor<dev.portfolio.application.port.in.ArchitectureProjectUseCase.Draft> draft =
                org.mockito.ArgumentCaptor.forClass(dev.portfolio.application.port.in.ArchitectureProjectUseCase.Draft.class);
        org.mockito.Mockito.verify(projects).create(draft.capture());
        org.assertj.core.api.Assertions.assertThat(draft.getValue().system().choices()).containsEntry("backend", "node");
        org.assertj.core.api.Assertions.assertThat(draft.getValue().system().nfr().budgetUsd()).isEqualTo(300.0);
    }

    @Test
    void oracleCloudOnlyExistsWhileItsFlagIsOn() throws Exception {
        String oci = BODY.replace("\"cloudProvider\":\"gcp\"", "\"cloudProvider\":\"oci\"");
        given(terraform.generate(eq(CloudProviderDomain.OCI), any(), any(), any()))
                .willReturn(new TerraformBundleDomain("provider \"oci\" {}", "variable \"region\" {}"));

        // Apagada: la misma respuesta que a una nube que no existe, en los tres caminos que la nombran.
        mockMvc.perform(post("/public/architecture/generate-terraform").contentType(MediaType.APPLICATION_JSON).content(oci))
                .andExpect(status().isBadRequest())
                .andExpect(content().string(org.hamcrest.Matchers.containsString("Nube no admitida: 'oci'. Valores: aws, gcp, azure")));
        mockMvc.perform(post("/public/architecture/pricing").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"cloudProvider\":\"oci\",\"services\":[\"vm\"]}"))
                .andExpect(status().isBadRequest());
        mockMvc.perform(post("/admin/architecture/projects").header(HttpHeaders.AUTHORIZATION, adminToken())
                        .contentType(MediaType.APPLICATION_JSON).content(oci))
                .andExpect(status().isBadRequest());

        given(featureFlags.enabled()).willReturn(java.util.Set.of(dev.portfolio.domain.model.FeatureFlagDomain.CLOUD_ORACLE));
        mockMvc.perform(post("/public/architecture/generate-terraform").contentType(MediaType.APPLICATION_JSON).content(oci))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.mainTf").value("provider \"oci\" {}"));
    }

    @Test
    void anyoneCanQuoteTheServicesOfACanvasAndAMissingPriceIsNeverAZero() throws Exception {
        SkuPricing d2s = new SkuPricing("D2s_v5", "Virtual Machines Dsv5 Series · D2s v5", Money.usd("0.096"), PricingUnit.HOURLY,
                "eastus", "Azure Retail Prices API", Instant.parse("2026-10-10T12:00:00Z"));
        given(pricing.quote(eq(CloudProviderDomain.AZURE), eq(List.of("vm", "snowflake", "functions")), any())).willReturn(List.of(
                PriceQuote.priced("vm", CloudProviderDomain.AZURE, PricingStatus.CACHED, d2s, "Solo el cómputo."),
                PriceQuote.enterpriseLicense("snowflake", CloudProviderDomain.AZURE, "Se contrata con oferta comercial."),
                PriceQuote.unknown("functions", CloudProviderDomain.AZURE, "")));

        mockMvc.perform(post("/public/architecture/pricing").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"cloudProvider\":\"azure\",\"services\":[\"vm\",\"snowflake\",\"functions\"]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.cloudProvider").value("azure"))
                .andExpect(jsonPath("$.currency").value("USD"))
                .andExpect(jsonPath("$.quotes.length()").value(3))
                .andExpect(jsonPath("$.quotes[0].code").value("vm"))
                .andExpect(jsonPath("$.quotes[0].status").value("CACHED"))
                .andExpect(jsonPath("$.quotes[0].sku").value("D2s_v5"))
                .andExpect(jsonPath("$.quotes[0].unit").value("HOURLY"))
                .andExpect(jsonPath("$.quotes[0].unitPrice").value(0.096))
                .andExpect(jsonPath("$.quotes[0].monthlyCost").value(70.08))
                .andExpect(jsonPath("$.quotes[0].source").value("Azure Retail Prices API"))
                .andExpect(jsonPath("$.quotes[0].fetchedAt").value("2026-10-10T12:00:00Z"))
                .andExpect(jsonPath("$.quotes[1].status").value("UNESTIMATED_ENTERPRISE_LICENSE"))
                .andExpect(jsonPath("$.quotes[1].unitPrice").doesNotExist())
                .andExpect(jsonPath("$.quotes[1].monthlyCost").doesNotExist())
                .andExpect(jsonPath("$.quotes[1].note").value("Se contrata con oferta comercial."))
                .andExpect(jsonPath("$.quotes[2].status").value("UNKNOWN_PRICING"))
                .andExpect(jsonPath("$.quotes[2].monthlyCost").doesNotExist())
                .andExpect(jsonPath("$.quotes[2].note").doesNotExist());
    }

    @Test
    void aQuoteIsValidatedAndRateLimitedLikeTheRestOfThePublicStudio() throws Exception {
        mockMvc.perform(post("/public/architecture/pricing").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"cloudProvider\":\"oracle\",\"services\":[\"vm\"]}"))
                .andExpect(status().isBadRequest());
        mockMvc.perform(post("/public/architecture/pricing").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"cloudProvider\":\"azure\",\"services\":[\"Standard_D2s_v5' or 1 eq 1\"]}"))
                .andExpect(status().isBadRequest());
        mockMvc.perform(post("/public/architecture/pricing").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"cloudProvider\":\"azure\",\"services\":[]}"))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(pricing);

        given(pricing.quote(any(), any(), any())).willThrow(new RateLimitExceededException(30, Duration.ofSeconds(20)));
        mockMvc.perform(post("/public/architecture/pricing").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"cloudProvider\":\"azure\",\"services\":[\"vm\"]}"))
                .andExpect(status().isTooManyRequests())
                .andExpect(header().string(HttpHeaders.RETRY_AFTER, "20"));
    }
}
