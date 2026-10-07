package dev.portfolio.infrastructure.adapter.in.web.error;

import org.springframework.http.HttpStatus;

public enum ApiError {

    VALIDATION_ERROR(HttpStatus.BAD_REQUEST, "validation-error", "Error de validación"),
    MALFORMED_REQUEST(HttpStatus.BAD_REQUEST, "malformed-request", "Petición mal formada"),
    UNSUPPORTED_GRANT_TYPE(HttpStatus.BAD_REQUEST, "unsupported-grant-type", "Tipo de concesión no soportado"),
    INVALID_CREDENTIALS(HttpStatus.UNAUTHORIZED, "invalid-credentials", "Credenciales inválidas"),
    RESOURCE_NOT_FOUND(HttpStatus.NOT_FOUND, "resource-not-found", "Recurso no encontrado"),
    UNAUTHORIZED(HttpStatus.UNAUTHORIZED, "unauthorized", "No autenticado"),
    FORBIDDEN(HttpStatus.FORBIDDEN, "forbidden", "Acceso denegado"),
    RATE_LIMIT_EXCEEDED(HttpStatus.TOO_MANY_REQUESTS, "rate-limit-exceeded", "Límite de peticiones excedido"),
    SERVICE_UNAVAILABLE(HttpStatus.SERVICE_UNAVAILABLE, "service-unavailable", "Servicio no disponible");

    private final HttpStatus status;
    private final String slug;
    private final String title;

    ApiError(HttpStatus status, String slug, String title) {
        this.status = status;
        this.slug = slug;
        this.title = title;
    }

    public HttpStatus status() {
        return status;
    }

    public String slug() {
        return slug;
    }

    public String title() {
        return title;
    }
}
