package dev.portfolio.application.port.out;

/** Hash de contraseñas con un algoritmo lento y con sal (BCrypt): nunca se guardan en claro. */
public interface PasswordHasherPort {

    String hash(String password);

    boolean matches(String password, String hash);
}
