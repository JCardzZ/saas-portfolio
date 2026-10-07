package dev.portfolio.application.port.out;

import dev.portfolio.domain.model.ClientIdentity;

import java.util.Optional;

public interface ClientAuthenticatorPort {

    /** @return la identidad del cliente, o vacío si el id o el secreto no coinciden */
    Optional<ClientIdentity> authenticate(String clientId, String clientSecret);
}
