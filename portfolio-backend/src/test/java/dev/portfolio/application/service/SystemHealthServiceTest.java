package dev.portfolio.application.service;

import dev.portfolio.application.port.out.SystemProbePort;
import dev.portfolio.domain.exception.SystemUnavailableException;
import dev.portfolio.domain.model.SystemHealthDomain.CircuitState;
import dev.portfolio.domain.model.SystemHealthDomain.ComponentHealth;
import dev.portfolio.domain.model.SystemHealthDomain.Status;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.mock;

class SystemHealthServiceTest {

    private static final ComponentHealth HEALTHY = new ComponentHealth(true, "ok");
    private static final ComponentHealth UNHEALTHY = new ComponentHealth(false, "caído");

    private final SystemProbePort probe = mock(SystemProbePort.class);
    private final SystemHealthService service = new SystemHealthService(probe);

    private void probesReport(ComponentHealth database, ComponentHealth cache, CircuitState circuit) {
        given(probe.database()).willReturn(database);
        given(probe.cache()).willReturn(cache);
        given(probe.aiEngineCircuit()).willReturn(circuit);
    }

    @Test
    void isUpWhenEverythingIsHealthyAndTheCircuitIsClosed() {
        probesReport(HEALTHY, HEALTHY, CircuitState.CLOSED);

        assertThat(service.check().status()).isEqualTo(Status.UP);
    }

    @Test
    void isDegradedWhenTheCacheIsDown() {
        probesReport(HEALTHY, UNHEALTHY, CircuitState.CLOSED);

        assertThat(service.check().status()).isEqualTo(Status.DEGRADED);
    }

    @Test
    void isDegradedWhileTheAiCircuitIsOpenOrRecovering() {
        probesReport(HEALTHY, HEALTHY, CircuitState.OPEN);
        assertThat(service.check().status()).isEqualTo(Status.DEGRADED);

        probesReport(HEALTHY, HEALTHY, CircuitState.HALF_OPEN);
        assertThat(service.check().status()).isEqualTo(Status.DEGRADED);
    }

    @Test
    void isUnavailableWhenTheDatabaseIsDown() {
        probesReport(UNHEALTHY, HEALTHY, CircuitState.CLOSED);

        assertThatThrownBy(service::check).isInstanceOf(SystemUnavailableException.class);
    }
}
