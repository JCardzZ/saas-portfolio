package dev.portfolio.infrastructure.config;

import dev.portfolio.application.port.out.FeatureFlags;
import dev.portfolio.domain.model.FeatureFlagDomain;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.mock;

class McpFlagFilterTest {

    @SuppressWarnings("unchecked")
    private final ObjectProvider<FeatureFlags> provider = mock(ObjectProvider.class);
    private final FeatureFlags flags = mock(FeatureFlags.class);
    private final McpServerConfig.McpFlagFilter filter = new McpServerConfig.McpFlagFilter(provider);

    private MockHttpServletResponse request(MockFilterChain chain) throws Exception {
        MockHttpServletResponse response = new MockHttpServletResponse();
        filter.doFilter(new MockHttpServletRequest("POST", "/v1/mcp"), response, chain);
        return response;
    }

    @Test
    void theServerDoesNotExistWhileItsFlagIsOff() throws Exception {
        given(provider.getIfAvailable()).willReturn(flags);
        given(flags.isEnabled(FeatureFlagDomain.MCP_SECTION)).willReturn(false);
        MockFilterChain chain = new MockFilterChain();

        MockHttpServletResponse response = request(chain);

        assertThat(response.getStatus()).isEqualTo(404);
        assertThat(response.getContentAsString()).contains("\"code\":\"RESOURCE_NOT_FOUND\"");
        assertThat(chain.getRequest()).as("la petición no llega al servlet").isNull();
    }

    @Test
    void itAlsoStaysClosedWithoutAFlagProvider() throws Exception {
        given(provider.getIfAvailable()).willReturn(null);

        assertThat(request(new MockFilterChain()).getStatus()).isEqualTo(404);
    }

    @Test
    void requestsGoThroughOnceTheFlagIsOn() throws Exception {
        given(provider.getIfAvailable()).willReturn(flags);
        given(flags.isEnabled(FeatureFlagDomain.MCP_SECTION)).willReturn(true);
        MockFilterChain chain = new MockFilterChain();

        MockHttpServletResponse response = request(chain);

        assertThat(response.getStatus()).isEqualTo(200);
        assertThat(chain.getRequest()).isNotNull();
    }
}
