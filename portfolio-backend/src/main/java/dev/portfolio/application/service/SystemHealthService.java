package dev.portfolio.application.service;

import dev.portfolio.application.port.in.SystemHealthUseCase;
import dev.portfolio.application.port.out.SystemProbePort;
import dev.portfolio.domain.exception.SystemUnavailableException;
import dev.portfolio.domain.model.SystemHealthDomain;

public class SystemHealthService implements SystemHealthUseCase {

    private final SystemProbePort probe;

    public SystemHealthService(SystemProbePort probe) {
        this.probe = probe;
    }

    @Override
    public SystemHealthDomain check() {
        SystemHealthDomain health =
                new SystemHealthDomain(probe.database(), probe.cache(), probe.aiEngineCircuit());
        if (health.status() == SystemHealthDomain.Status.DOWN) {
            throw new SystemUnavailableException("La base de datos no está disponible");
        }
        return health;
    }
}
