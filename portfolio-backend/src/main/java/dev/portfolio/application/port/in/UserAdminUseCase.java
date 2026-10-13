package dev.portfolio.application.port.in;

import dev.portfolio.domain.model.access.Role;
import dev.portfolio.domain.model.access.UserAccountDomain;
import dev.portfolio.domain.model.access.UserChange;

import java.util.List;

/** Gestión de las cuentas de usuario. No hay registro público: las crea quien tiene el permiso. */
public interface UserAdminUseCase {

    List<UserAccountDomain> findAll();

    UserAccountDomain create(String email, String displayName, String password, Role role);

    /** @param actorSubject quién hace el cambio: nadie se quita a sí mismo el acceso */
    UserAccountDomain update(String id, UserChange change, String actorSubject);

    /**
     * Crea el primer administrador si todavía no hay ninguna cuenta.
     *
     * @return {@code true} si lo ha creado
     */
    boolean bootstrapAdmin(String email, String password);
}
