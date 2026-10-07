package dev.portfolio.application.port.in;

import dev.portfolio.domain.model.AccessToken;
import dev.portfolio.domain.model.ClientCredentials;

public interface AuthUseCase {

    /**
     * @param clientAddress origen de la petición, usado para limitar los intentos
     */
    AccessToken issueToken(ClientCredentials credentials, String clientAddress);
}
