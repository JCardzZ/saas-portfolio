package dev.portfolio.application.port.out;

import dev.portfolio.domain.model.AccessToken;
import dev.portfolio.domain.model.ClientIdentity;

public interface TokenIssuerPort {

    AccessToken issue(ClientIdentity identity);
}
