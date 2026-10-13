package dev.portfolio.domain.exception;

public class InvalidCredentialsException extends RuntimeException {

    public InvalidCredentialsException() {
        super("Credenciales de cliente inválidas");
    }

    public InvalidCredentialsException(String message) {
        super(message);
    }
}
