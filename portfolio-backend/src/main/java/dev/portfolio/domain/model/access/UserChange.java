package dev.portfolio.domain.model.access;

/** Cambios pedidos sobre una cuenta: un campo a {@code null} no se toca. */
public record UserChange(String displayName, String password, Role role, Boolean active) {
}
