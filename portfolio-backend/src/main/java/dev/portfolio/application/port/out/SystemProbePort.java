package dev.portfolio.application.port.out;

import dev.portfolio.domain.model.SystemHealthDomain.CircuitState;
import dev.portfolio.domain.model.SystemHealthDomain.ComponentHealth;

/** Las sondas nunca lanzan: un fallo se reporta como componente no saludable. */
public interface SystemProbePort {

    ComponentHealth database();

    ComponentHealth cache();

    CircuitState aiEngineCircuit();
}
