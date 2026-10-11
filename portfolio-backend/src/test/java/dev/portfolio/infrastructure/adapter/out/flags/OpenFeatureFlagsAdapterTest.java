package dev.portfolio.infrastructure.adapter.out.flags;

import dev.openfeature.sdk.Client;
import dev.openfeature.sdk.ErrorCode;
import dev.openfeature.sdk.FlagEvaluationDetails;
import dev.openfeature.sdk.OpenFeatureAPI;
import dev.portfolio.application.port.in.FeatureFlagUseCase;
import dev.portfolio.application.port.out.FeatureFlags;
import dev.portfolio.domain.model.FeatureFlagDomain;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.EnumSet;

import static dev.portfolio.domain.model.FeatureFlagDomain.CLOUD_ORACLE;
import static dev.portfolio.domain.model.FeatureFlagDomain.MCP_SECTION;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.mock;

/** El adaptador y el proveedor juntos, a través del SDK de OpenFeature real. */
class OpenFeatureFlagsAdapterTest {

    private static final String DOMAIN = "open-feature-flags-adapter-test";

    private final FeatureFlagUseCase useCase = mock(FeatureFlagUseCase.class);
    private Client client;
    private FeatureFlags flags;

    @BeforeEach
    void registerTheProvider() {
        OpenFeatureAPI api = OpenFeatureAPI.getInstance();
        api.setProviderAndWait(DOMAIN, new PortfolioFeatureProvider(useCase));
        client = api.getClient(DOMAIN);
        flags = new OpenFeatureFlagsAdapter(client);
    }

    @Test
    void aFlagIsOnOnlyWhenThePlatformSaysSo() {
        given(useCase.enabled()).willReturn(EnumSet.of(MCP_SECTION));

        assertThat(flags.isEnabled(MCP_SECTION)).isTrue();
        assertThat(flags.isEnabled(CLOUD_ORACLE)).isFalse();
    }

    @Test
    void everyFlagCountsAsOffWhenItCannotBeRead() {
        given(useCase.enabled()).willThrow(new IllegalStateException("database is down"));

        for (FeatureFlagDomain flag : FeatureFlagDomain.values()) {
            assertThat(flags.isEnabled(flag)).isFalse();
        }
    }

    @Test
    void anUnknownKeyOrANonBooleanQuestionGetsTheCallersDefault() {
        given(useCase.enabled()).willReturn(EnumSet.allOf(FeatureFlagDomain.class));

        FlagEvaluationDetails<Boolean> unknown = client.getBooleanDetails("does.not-exist", true);
        assertThat(unknown.getValue()).isTrue();
        assertThat(unknown.getErrorCode()).isEqualTo(ErrorCode.FLAG_NOT_FOUND);

        FlagEvaluationDetails<String> text = client.getStringDetails("mcp.section", "fallback");
        assertThat(text.getValue()).isEqualTo("fallback");
        assertThat(text.getErrorCode()).isEqualTo(ErrorCode.TYPE_MISMATCH);
    }
}
