package dev.portfolio.application.service;

import dev.portfolio.application.port.out.CachePort;
import dev.portfolio.application.port.out.FeatureFlagRepositoryPort;
import dev.portfolio.domain.exception.ResourceNotFoundException;
import dev.portfolio.domain.model.FeatureFlagChangeDomain;
import dev.portfolio.domain.model.FeatureFlagDomain;
import dev.portfolio.domain.model.FeatureFlagStateDomain;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import static dev.portfolio.domain.model.FeatureFlagDomain.CLOUD_ORACLE;
import static dev.portfolio.domain.model.FeatureFlagDomain.MCP_SECTION;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

class FeatureFlagServiceTest {

    private static final Instant NOW = Instant.parse("2026-10-11T09:00:00Z");
    private static final FeatureFlagStateDomain MCP_ON = new FeatureFlagStateDomain(MCP_SECTION, true, NOW, "admin-ui");
    private static final FeatureFlagStateDomain ORACLE_OFF = new FeatureFlagStateDomain(CLOUD_ORACLE, false, NOW, "admin-ui");

    private final FeatureFlagRepositoryPort repository = mock(FeatureFlagRepositoryPort.class);
    private final CachePort cache = mock(CachePort.class);
    private final FeatureFlagService service = new FeatureFlagService(repository, cache, Clock.fixed(NOW, ZoneOffset.UTC));

    @Test
    void everyFlagIsOffUntilSomeoneTurnsItOn() {
        given(cache.getList(CacheKeys.FEATURE_FLAGS_ENABLED, String.class)).willReturn(Optional.empty());
        given(repository.findAll()).willReturn(List.of());

        assertThat(service.enabled()).isEmpty();
        assertThat(service.findAll())
                .hasSize(FeatureFlagDomain.values().length)
                .allSatisfy(state -> {
                    assertThat(state.enabled()).isFalse();
                    assertThat(state.updatedAt()).isNull();
                });
    }

    @Test
    void readsTheEnabledFlagsFromTheCacheAndFillsItOnAMiss() {
        given(cache.getList(CacheKeys.FEATURE_FLAGS_ENABLED, String.class)).willReturn(Optional.of(List.of("mcp.section")));
        assertThat(service.enabled()).containsExactly(MCP_SECTION);
        verify(repository, never()).findAll();

        given(cache.getList(CacheKeys.FEATURE_FLAGS_ENABLED, String.class)).willReturn(Optional.empty());
        given(repository.findAll()).willReturn(List.of(MCP_ON, ORACLE_OFF));
        assertThat(service.enabled()).containsExactly(MCP_SECTION);
        verify(cache).put(CacheKeys.FEATURE_FLAGS_ENABLED, List.of("mcp.section"), CacheKeys.FEATURE_FLAGS_TTL);
    }

    @Test
    void aCachedKeyThatTheCodeNoLongerDeclaresIsIgnored() {
        given(cache.getList(CacheKeys.FEATURE_FLAGS_ENABLED, String.class))
                .willReturn(Optional.of(List.of("retired.flag", "mcp.section")));

        assertThat(service.enabled()).containsExactly(MCP_SECTION);
    }

    @Test
    void aChangeIsSavedWithItsAuditEntryAndPurgesTheCache() {
        given(repository.findAll()).willReturn(List.of(ORACLE_OFF));
        given(repository.save(any())).willReturn(new FeatureFlagStateDomain(CLOUD_ORACLE, true, NOW, "admin-ui"));

        FeatureFlagStateDomain saved = service.set("cloud.oracle", true, "admin-ui");

        assertThat(saved.enabled()).isTrue();
        verify(repository).save(new FeatureFlagChangeDomain(CLOUD_ORACLE, true, false, "admin-ui", NOW));
        verify(cache).evict(CacheKeys.FEATURE_FLAGS_ENABLED);
    }

    @Test
    void settingAFlagToTheStateItAlreadyHasLeavesNoAuditEntry() {
        given(repository.findAll()).willReturn(List.of(MCP_ON));

        assertThat(service.set("mcp.section", true, "someone-else")).isEqualTo(MCP_ON);
        assertThat(service.set("cloud.oracle", false, "someone-else").enabled()).isFalse();

        verify(repository, never()).save(any());
        verify(cache, never()).evict(any(String[].class));
    }

    @Test
    void anUnknownFlagIsNotFoundAndNothingIsWritten() {
        assertThatThrownBy(() -> service.set("does.not-exist", true, "admin-ui"))
                .isInstanceOf(ResourceNotFoundException.class);

        verify(repository, never()).save(any());
    }

    @Test
    void theAuditTrailIsCappedAtTheMostRecentChanges() {
        service.audit();

        verify(repository).findRecentChanges(FeatureFlagService.AUDIT_LIMIT);
    }
}
