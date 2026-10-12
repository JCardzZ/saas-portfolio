package dev.portfolio.infrastructure.adapter.in.web;

import dev.portfolio.application.port.in.FeatureFlagUseCase;
import dev.portfolio.application.port.out.FeatureFlags;
import dev.portfolio.application.port.out.TelemetryPort;
import dev.portfolio.domain.exception.ResourceNotFoundException;
import dev.portfolio.domain.model.FeatureFlagChangeDomain;
import dev.portfolio.domain.model.FeatureFlagDomain;
import dev.portfolio.domain.model.FeatureFlagStateDomain;
import dev.portfolio.infrastructure.adapter.in.web.controller.FeatureFlagsController;
import dev.portfolio.infrastructure.adapter.in.web.error.GlobalExceptionHandler;
import dev.portfolio.infrastructure.adapter.in.web.error.ProblemDetailFactory;
import dev.portfolio.infrastructure.adapter.in.web.mapper.FeatureFlagWebMapper;
import dev.portfolio.infrastructure.config.SecurityConfig;
import dev.portfolio.infrastructure.security.JwtTokenService;
import dev.portfolio.infrastructure.security.ProblemDetailSecurityHandler;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;
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
import java.util.EnumSet;
import java.util.List;

import static dev.portfolio.domain.model.FeatureFlagDomain.CLOUD_ORACLE;
import static dev.portfolio.domain.model.FeatureFlagDomain.MCP_SECTION;
import static org.hamcrest.Matchers.hasSize;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(controllers = FeatureFlagsController.class)
@Import({SecurityConfig.class, JwtTokenService.class, ProblemDetailSecurityHandler.class, ProblemDetailFactory.class,
        GlobalExceptionHandler.class, FeatureFlagWebMapper.class})
@TestPropertySource(properties = "security.jwt.secret=" + FeatureFlagsApiTest.SECRET)
class FeatureFlagsApiTest {

    static final String SECRET = "dGVzdC1vbmx5LWhtYWMta2V5LTAxMjM0NTY3ODlhYmNkZWY=";
    private static final Instant CHANGED = Instant.parse("2026-10-11T09:00:00Z");

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private FeatureFlagUseCase flags;

    @MockBean
    private FeatureFlags featureFlags;

    @MockBean
    private TelemetryPort telemetryPort;

    private static String adminToken() {
        return "Bearer " + Jwts.builder().subject("admin-ui").claim("roles", List.of("ROLE_ADMIN"))
                .expiration(Date.from(Instant.now().plusSeconds(300)))
                .signWith(Keys.hmacShaKeyFor(Decoders.BASE64.decode(SECRET))).compact();
    }

    @Test
    void anyoneCanReadEveryFlagWithItsState() throws Exception {
        given(flags.enabled()).willReturn(EnumSet.of(MCP_SECTION));

        mockMvc.perform(get("/public/features"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(FeatureFlagDomain.values().length)))
                .andExpect(jsonPath("$[?(@.key == 'mcp.section')].enabled").value(true))
                .andExpect(jsonPath("$[?(@.key == 'cloud.oracle')].enabled").value(false))
                .andExpect(jsonPath("$[0].description").isNotEmpty())
                .andExpect(jsonPath("$[0].updatedBy").doesNotExist());
    }

    @Test
    void theAdministrationSeesWhoChangedEachFlag() throws Exception {
        given(flags.findAll()).willReturn(List.of(
                new FeatureFlagStateDomain(MCP_SECTION, true, CHANGED, "admin-ui"),
                FeatureFlagStateDomain.untouched(CLOUD_ORACLE)));

        mockMvc.perform(get("/admin/features").header(HttpHeaders.AUTHORIZATION, adminToken()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].key").value("mcp.section"))
                .andExpect(jsonPath("$[0].updatedAt").value("2026-10-11T09:00:00Z"))
                .andExpect(jsonPath("$[0].updatedBy").value("admin-ui"))
                .andExpect(jsonPath("$[1].enabled").value(false))
                .andExpect(jsonPath("$[1].updatedAt").doesNotExist());
    }

    @Test
    void aChangeIsAttributedToTheClientOfTheToken() throws Exception {
        given(flags.set("mcp.section", true, "admin-ui"))
                .willReturn(new FeatureFlagStateDomain(MCP_SECTION, true, CHANGED, "admin-ui"));

        mockMvc.perform(put("/admin/features/mcp.section").header(HttpHeaders.AUTHORIZATION, adminToken())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"enabled\":true,\"actor\":\"someone-else\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.enabled").value(true))
                .andExpect(jsonPath("$.updatedBy").value("admin-ui"));

        verify(flags).set("mcp.section", true, "admin-ui");
    }

    @Test
    void anUnknownFlagAnswersNotFoundAndAnEmptyBodyIsRejected() throws Exception {
        given(flags.set("does.not-exist", true, "admin-ui")).willThrow(new ResourceNotFoundException("Feature flag", "does.not-exist"));

        mockMvc.perform(put("/admin/features/does.not-exist").header(HttpHeaders.AUTHORIZATION, adminToken())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"enabled\":true}"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("RESOURCE_NOT_FOUND"));
        mockMvc.perform(put("/admin/features/mcp.section").header(HttpHeaders.AUTHORIZATION, adminToken())
                        .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void theAuditTrailListsEachChange() throws Exception {
        given(flags.audit()).willReturn(List.of(new FeatureFlagChangeDomain(MCP_SECTION, true, false, "admin-ui", CHANGED)));

        mockMvc.perform(get("/admin/features/audit").header(HttpHeaders.AUTHORIZATION, adminToken()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].key").value("mcp.section"))
                .andExpect(jsonPath("$[0].enabled").value(true))
                .andExpect(jsonPath("$[0].previous").value(false))
                .andExpect(jsonPath("$[0].actor").value("admin-ui"))
                .andExpect(jsonPath("$[0].changedAt").value("2026-10-11T09:00:00Z"));
    }

    @Test
    void readingDetailsOrChangingAFlagNeedsAnAdministrator() throws Exception {
        mockMvc.perform(get("/admin/features")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/admin/features/audit")).andExpect(status().isUnauthorized());
        mockMvc.perform(put("/admin/features/mcp.section").contentType(MediaType.APPLICATION_JSON).content("{\"enabled\":true}"))
                .andExpect(status().isUnauthorized());

        verifyNoInteractions(flags);
    }
}
