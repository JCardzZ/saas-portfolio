package dev.portfolio.domain.exception;

public class UnsupportedGrantTypeException extends RuntimeException {

    public UnsupportedGrantTypeException(String grantType) {
        super("grantType '%s' no soportado".formatted(grantType));
    }
}
