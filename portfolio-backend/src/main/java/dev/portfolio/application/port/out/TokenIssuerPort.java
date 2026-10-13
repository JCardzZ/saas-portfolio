package dev.portfolio.application.port.out;

import java.time.Duration;

import dev.portfolio.domain.model.AccessToken;
import dev.portfolio.domain.model.ClientIdentity;

public interface TokenIssuerPort {

    AccessToken issue(ClientIdentity identity);

    /** Emite un token con la vida indicada, en lugar de la configurada por defecto. */
    AccessToken issue(ClientIdentity identity, Duration timeToLive);
}
