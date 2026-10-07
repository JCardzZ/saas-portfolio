package dev.portfolio.infrastructure.adapter.in.web.error;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ProblemDetail;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * Construye el cuerpo RFC 7807 con las extensiones que exige el esquema
 * ProblemDetails del contrato OpenAPI (code, timestamp, traceId).
 */
@Component
public class ProblemDetailFactory {

    private static final String ERROR_TYPE_BASE = "https://api.example.com/saas-portfolio/errors/";

    public ProblemDetail create(ApiError error, String detail, HttpServletRequest request) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(error.status(), detail);
        problem.setType(URI.create(ERROR_TYPE_BASE + error.slug()));
        problem.setTitle(error.title());
        problem.setInstance(URI.create(request.getRequestURI()));
        problem.setProperty("code", error.name());
        problem.setProperty("timestamp", OffsetDateTime.now().toString());
        problem.setProperty("traceId", UUID.randomUUID().toString());
        return problem;
    }
}
