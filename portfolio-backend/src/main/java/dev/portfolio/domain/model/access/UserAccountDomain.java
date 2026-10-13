package dev.portfolio.domain.model.access;

import dev.portfolio.domain.exception.InvalidRequestException;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Cuenta de una persona que entra en la administración. No lleva la contraseña ni su hash: eso
 * no sale del repositorio más que para comprobar un inicio de sesión.
 */
public record UserAccountDomain(String id, String email, String displayName, Role role, boolean active, Instant createdAt) {

    public static final int MAX_EMAIL_LENGTH = 254;
    public static final int MAX_NAME_LENGTH = 80;
    public static final int MIN_PASSWORD_LENGTH = 12;
    /** BCrypt solo usa los primeros 72 bytes: una contraseña más larga se truncaría en silencio. */
    public static final int MAX_PASSWORD_BYTES = 72;

    private static final Pattern EMAIL = Pattern.compile("^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\\.[A-Za-z0-9-]+)+$");

    /** El correo como se guarda y se compara: sin espacios y en minúsculas. */
    public static String normalizeEmail(String email) {
        String normalized = email == null ? "" : email.trim().toLowerCase(Locale.ROOT);
        if (normalized.isEmpty() || normalized.length() > MAX_EMAIL_LENGTH || !EMAIL.matcher(normalized).matches()) {
            throw new InvalidRequestException("El correo no es válido");
        }
        return normalized;
    }

    public static String normalizeName(String displayName) {
        String normalized = displayName == null ? "" : displayName.trim();
        if (normalized.isEmpty() || normalized.length() > MAX_NAME_LENGTH) {
            throw new InvalidRequestException("El nombre es obligatorio y admite hasta %d caracteres".formatted(MAX_NAME_LENGTH));
        }
        return normalized;
    }

    public static void checkPassword(String password) {
        if (password == null || password.length() < MIN_PASSWORD_LENGTH
                || password.getBytes(StandardCharsets.UTF_8).length > MAX_PASSWORD_BYTES) {
            throw new InvalidRequestException("La contraseña debe tener entre %d y %d caracteres"
                    .formatted(MIN_PASSWORD_LENGTH, MAX_PASSWORD_BYTES));
        }
    }
}
