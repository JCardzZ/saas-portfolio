package dev.portfolio.domain.model;

public record AccessToken(String value, long expiresInSeconds) {
}
