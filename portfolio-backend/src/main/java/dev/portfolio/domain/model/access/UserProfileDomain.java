package dev.portfolio.domain.model.access;

/**
 * Quién es el que llama: una persona (con correo y nombre) o un cliente de máquina, del que solo
 * se conoce su identificador.
 */
public record UserProfileDomain(String subject, String email, String displayName, Role role) {

    public static UserProfileDomain of(UserAccountDomain account) {
        return new UserProfileDomain(account.id(), account.email(), account.displayName(), account.role());
    }

    public static UserProfileDomain machine(String subject, Role role) {
        return new UserProfileDomain(subject, null, subject, role);
    }
}
