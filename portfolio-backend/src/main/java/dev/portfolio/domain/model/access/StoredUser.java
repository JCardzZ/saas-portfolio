package dev.portfolio.domain.model.access;

/** Una cuenta junto al hash de su contraseña: solo para comprobar un inicio de sesión. */
public record StoredUser(UserAccountDomain account, String passwordHash) {
}
