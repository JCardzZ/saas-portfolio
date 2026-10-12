package dev.portfolio.infrastructure.adapter.in.web;

import dev.portfolio.application.port.in.ArchitectureProjectUseCase;
import dev.portfolio.application.port.in.McpAccessUseCase;
import dev.portfolio.application.port.in.PricingUseCase;
import dev.portfolio.application.port.in.RAGUseCase;
import dev.portfolio.application.port.in.SystemDesignUseCase;
import dev.portfolio.application.port.in.TerraformUseCase;
import dev.portfolio.application.port.out.FeatureFlags;
import dev.portfolio.application.port.out.TelemetryPort;
import dev.portfolio.domain.model.FeatureFlagDomain;
import dev.portfolio.infrastructure.adapter.in.mcp.McpSdkServer;
import dev.portfolio.infrastructure.adapter.in.mcp.PortfolioTools;
import dev.portfolio.infrastructure.adapter.in.web.controller.McpStatusController;
import dev.portfolio.infrastructure.adapter.in.web.error.GlobalExceptionHandler;
import dev.portfolio.infrastructure.adapter.in.web.error.ProblemDetailFactory;
import dev.portfolio.infrastructure.adapter.in.web.flags.FeatureGateConfig;
import dev.portfolio.infrastructure.config.SecurityConfig;
import dev.portfolio.infrastructure.observability.McpToolTelemetry;
import dev.portfolio.infrastructure.security.JwtTokenService;
import dev.portfolio.infrastructure.security.ProblemDetailSecurityHandler;
import dev.portfolio.testsupport.SystemDesignFixture;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.mock;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(controllers = McpStatusController.class)
@Import({SecurityConfig.class, JwtTokenService.class, ProblemDetailSecurityHandler.class, ProblemDetailFactory.class,
        GlobalExceptionHandler.class, FeatureGateConfig.class})
@TestPropertySource(properties = "security.jwt.secret=dGVzdC1vbmx5LWhtYWMta2V5LTAxMjM0NTY3ODlhYmNkZWY=")
class McpStatusApiTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private McpSdkServer server;

    @MockBean
    private McpAccessUseCase access;

    @MockBean
    private McpToolTelemetry telemetry;

    @MockBean
    private FeatureFlags flags;

    @MockBean
    private TelemetryPort telemetryPort;

    @BeforeEach
    void setUp() {
        SystemDesignUseCase systemDesign = mock(SystemDesignUseCase.class);
        given(systemDesign.catalog()).willReturn(SystemDesignFixture.rules());
        java.util.List<dev.portfolio.infrastructure.adapter.in.mcp.McpTool> tools = PortfolioTools.all(mock(ArchitectureProjectUseCase.class),
                mock(TerraformUseCase.class), mock(PricingUseCase.class), mock(RAGUseCase.class), systemDesign);
        given(server.tools()).willReturn(tools);
        given(access.limits()).willReturn(new McpAccessUseCase.Limits(30, 60, 2000));
        given(flags.isEnabled(FeatureFlagDomain.MCP_SECTION)).willReturn(true);
    }

    @Test
    void doesNotExistWhileTheFlagIsOff() throws Exception {
        given(flags.isEnabled(FeatureFlagDomain.MCP_SECTION)).willReturn(false);

        mockMvc.perform(get("/public/mcp/status")).andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("RESOURCE_NOT_FOUND"));
    }

    @Test
    void tellsWhatTheServerPublishesItsLimitsAndItsMeasuredLatency() throws Exception {
        given(telemetry.latency()).willReturn(new McpToolTelemetry.Latency(128, 14.2, 240.5));

        mockMvc.perform(get("/public/mcp/status"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.online").value(true))
                .andExpect(jsonPath("$.endpoint").value("/mcp"))
                .andExpect(jsonPath("$.protocolVersion").value("2025-11-25"))
                .andExpect(jsonPath("$.server.name").value("portfolio-platform"))
                .andExpect(jsonPath("$.tools.length()").value(6))
                .andExpect(jsonPath("$.tools[0].name").value("listar_plantillas"))
                .andExpect(jsonPath("$.tools[0].kind").value("read"))
                .andExpect(jsonPath("$.tools[0].version").value("1.0.0"))
                .andExpect(jsonPath("$.tools[2].name").value("generar_terraform"))
                .andExpect(jsonPath("$.tools[2].kind").value("generate"))
                .andExpect(jsonPath("$.tools[2].title").value("Generar el esqueleto de Terraform"))
                // El esquema de entrada no viaja aquí: es cosa de tools/list.
                .andExpect(jsonPath("$.tools[0].inputSchema").doesNotExist())
                .andExpect(jsonPath("$.limits.perClient").value(30))
                .andExpect(jsonPath("$.limits.windowSeconds").value(60))
                .andExpect(jsonPath("$.limits.dailyTotal").value(2000))
                .andExpect(jsonPath("$.latency.calls").value(128))
                .andExpect(jsonPath("$.latency.p50Ms").value(14.2))
                .andExpect(jsonPath("$.latency.p95Ms").value(240.5));
    }

    @Test
    void hasNoPercentilesBeforeTheFirstCall() throws Exception {
        given(telemetry.latency()).willReturn(new McpToolTelemetry.Latency(0, null, null));

        mockMvc.perform(get("/public/mcp/status"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.latency.calls").value(0))
                .andExpect(jsonPath("$.latency.p95Ms").doesNotExist());
    }
}
