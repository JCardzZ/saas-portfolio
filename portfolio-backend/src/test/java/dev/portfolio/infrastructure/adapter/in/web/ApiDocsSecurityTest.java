package dev.portfolio.infrastructure.adapter.in.web;

import dev.portfolio.application.port.in.SystemHealthUseCase;
import dev.portfolio.application.port.out.TelemetryPort;
import dev.portfolio.infrastructure.adapter.in.web.controller.TelemetryController;
import dev.portfolio.infrastructure.adapter.in.web.error.ProblemDetailFactory;
import dev.portfolio.infrastructure.adapter.in.web.mapper.HealthWebMapperImpl;
import dev.portfolio.infrastructure.adapter.in.web.mapper.TelemetryWebMapperImpl;
import dev.portfolio.infrastructure.adapter.in.web.sse.TelemetryStreamBroadcaster;
import dev.portfolio.infrastructure.config.SecurityConfig;
import dev.portfolio.infrastructure.security.JwtTokenService;
import dev.portfolio.infrastructure.security.ProblemDetailSecurityHandler;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Documentación de la API: el contrato que muestra Swagger UI es público (igual que el
 * repositorio), y lo que springdoc genera desde el código no lo es.
 */
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
@TestPropertySource(properties = "security.jwt.secret=dGVzdC1vbmx5LWhtYWMta2V5LTAxMjM0NTY3ODlhYmNkZWY=")
class ApiDocsSecurityTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private SystemHealthUseCase systemHealthUseCase;

    @MockBean
    private TelemetryPort telemetryPort;

    @Test
    void theContractIsServedPubliclyAsTheSwaggerUiSource() throws Exception {
        mockMvc.perform(get("/openapi.yaml"))
                .andExpect(status().isOk())
                .andExpect(content().string(containsString("openapi: 3.0.3")))
                .andExpect(content().string(containsString("/telemetry/health:")));
    }

    @Test
    void theDocsGeneratedFromCodeAreNotPublic() throws Exception {
        mockMvc.perform(get("/v3/api-docs")).andExpect(status().isUnauthorized());
    }
}
