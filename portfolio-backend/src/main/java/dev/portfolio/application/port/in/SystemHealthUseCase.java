package dev.portfolio.application.port.in;

import dev.portfolio.domain.exception.SystemUnavailableException;
import dev.portfolio.domain.model.SystemHealthDomain;

public interface SystemHealthUseCase {

    /**
     * @return el estado del sistema mientras pueda atender peticiones (UP o DEGRADED)
     * @throws SystemUnavailableException si falta una dependencia imprescindible
     */
    SystemHealthDomain check();
}
