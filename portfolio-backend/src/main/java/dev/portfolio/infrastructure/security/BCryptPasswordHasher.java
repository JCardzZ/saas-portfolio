package dev.portfolio.infrastructure.security;

import dev.portfolio.application.port.out.PasswordHasherPort;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Component;

/** Hash de contraseñas con BCrypt (coste 12). */
@Component
public class BCryptPasswordHasher implements PasswordHasherPort {

    private static final int STRENGTH = 12;

    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder(STRENGTH);

    @Override
    public String hash(String password) {
        return encoder.encode(password);
    }

    @Override
    public boolean matches(String password, String hash) {
        return encoder.matches(password, hash);
    }
}
