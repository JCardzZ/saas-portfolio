package dev.portfolio.application.port.in;

import dev.portfolio.domain.model.access.SessionDomain;
import dev.portfolio.domain.model.access.UserProfileDomain;

import java.util.List;

/** Inicio, renovación y cierre de sesión de las personas, y quién es el que llama. */
public interface UserSessionUseCase {

    /** @param clientAddress origen de la petición, usado para limitar los intentos */
    SessionDomain login(String email, String password, String clientAddress);

    SessionDomain refresh(String refreshToken, String clientAddress);

    /** Revoca el token de refresco. No dice si existía. */
    void logout(String refreshToken);

    /**
     * @param subject sujeto del token de acceso
     * @param authorities valores del claim {@code roles}
     */
    UserProfileDomain profile(String subject, List<String> authorities);
}
