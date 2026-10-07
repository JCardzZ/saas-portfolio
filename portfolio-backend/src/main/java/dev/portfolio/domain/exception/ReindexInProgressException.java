package dev.portfolio.domain.exception;

public class ReindexInProgressException extends RuntimeException {

    public ReindexInProgressException() {
        super("Ya hay una reindexación en curso");
    }
}
