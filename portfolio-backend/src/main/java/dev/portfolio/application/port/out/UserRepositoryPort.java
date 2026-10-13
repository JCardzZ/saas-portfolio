package dev.portfolio.application.port.out;

import dev.portfolio.domain.model.access.StoredUser;
import dev.portfolio.domain.model.access.UserAccountDomain;

import java.util.List;
import java.util.Optional;

/** Cuentas de usuario. El hash de la contraseña solo sale para comprobar un inicio de sesión. */
public interface UserRepositoryPort {

    List<UserAccountDomain> findAll();

    Optional<UserAccountDomain> findById(String id);

    /** @param email ya normalizado (minúsculas, sin espacios) */
    Optional<StoredUser> findByEmail(String email);

    boolean existsByEmail(String email);

    long count();

    /** Administradores activos, sin contar a {@code exceptId}. */
    long countActiveAdminsExcept(String exceptId);

    UserAccountDomain create(UserAccountDomain account, String passwordHash);

    /** @param passwordHash nuevo hash, o {@code null} para conservar el que hay */
    UserAccountDomain update(UserAccountDomain account, String passwordHash);
}
