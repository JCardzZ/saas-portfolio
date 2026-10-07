package dev.portfolio.domain.exception;

public class SystemUnavailableException extends RuntimeException {

    public SystemUnavailableException(String message) {
        super(message);
    }
}
