package dev.portfolio.infrastructure.adapter.in.web.flags;

import dev.portfolio.application.port.out.FeatureFlags;
import dev.portfolio.infrastructure.adapter.in.web.error.GlobalExceptionHandler;
import dev.portfolio.infrastructure.adapter.in.web.error.ProblemDetailFactory;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import static dev.portfolio.domain.model.FeatureFlagDomain.MCP_SECTION;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.mock;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class FeatureGateInterceptorTest {

    private final FeatureFlags flags = mock(FeatureFlags.class);
    private final MockMvc mockMvc = MockMvcBuilders.standaloneSetup(new Endpoints())
            .setControllerAdvice(new GlobalExceptionHandler(new ProblemDetailFactory()))
            .addMappedInterceptors(new String[]{"/gated/**"}, new FeatureGateInterceptor(() -> flags, MCP_SECTION))
            .build();

    @Test
    void aGatedRouteAnswersNotFoundWhileItsFlagIsOff() throws Exception {
        given(flags.isEnabled(MCP_SECTION)).willReturn(false);

        mockMvc.perform(get("/gated/thing"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("RESOURCE_NOT_FOUND"));
    }

    @Test
    void aGatedRouteWorksOnceItsFlagIsOn() throws Exception {
        given(flags.isEnabled(MCP_SECTION)).willReturn(true);

        mockMvc.perform(get("/gated/thing")).andExpect(status().isOk()).andExpect(content().string("gated"));
    }

    @Test
    void routesOutsideTheGateDoNotDependOnTheFlag() throws Exception {
        given(flags.isEnabled(MCP_SECTION)).willReturn(false);

        mockMvc.perform(get("/open")).andExpect(status().isOk()).andExpect(content().string("open"));
    }

    @RestController
    static class Endpoints {

        @GetMapping("/gated/thing")
        String gated() {
            return "gated";
        }

        @GetMapping("/open")
        String open() {
            return "open";
        }
    }
}
