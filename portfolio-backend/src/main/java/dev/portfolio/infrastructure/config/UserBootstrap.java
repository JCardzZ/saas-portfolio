package dev.portfolio.infrastructure.config;

import dev.portfolio.application.port.in.UserAdminUseCase;
import dev.portfolio.infrastructure.security.SessionProperties;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

/**
 * Crea el primer administrador al arrancar, si no hay ninguna cuenta y la configuración trae su
 * correo y su contraseña. Sin ellos no hace nada: se puede seguir entrando con el cliente de
 * máquina y crear las cuentas desde ahí. Un fallo aquí no impide arrancar.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class UserBootstrap implements ApplicationRunner {

    private final UserAdminUseCase users;
    private final SessionProperties properties;

    @Override
    public void run(ApplicationArguments args) {
        if (!StringUtils.hasText(properties.bootstrapEmail()) || !StringUtils.hasText(properties.bootstrapPassword())) {
            return;
        }
        try {
            if (users.bootstrapAdmin(properties.bootstrapEmail(), properties.bootstrapPassword())) {
                // El correo no se registra: es un dato personal y el log puede acabar en otro sitio.
                log.info("Creado el primer administrador a partir de la configuración");
            }
        } catch (RuntimeException e) {
            log.warn("No se pudo crear el primer administrador: {}", e.getMessage());
        }
    }
}
