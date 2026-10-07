package dev.portfolio.infrastructure.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import dev.portfolio.infrastructure.adapter.in.web.error.ApiError;
import dev.portfolio.infrastructure.adapter.in.web.error.ProblemDetailFactory;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

/**
 * Los fallos de seguridad ocurren en la cadena de filtros, antes de llegar a
 * GlobalExceptionHandler, así que el cuerpo RFC 7807 se escribe aquí.
 */
@Component
@RequiredArgsConstructor
public class ProblemDetailSecurityHandler implements AuthenticationEntryPoint, AccessDeniedHandler {

    private final ProblemDetailFactory problemDetailFactory;
    private final ObjectMapper objectMapper;

    @Override
    public void commence(HttpServletRequest request, HttpServletResponse response, AuthenticationException ex)
            throws IOException {
        response.setHeader(HttpHeaders.WWW_AUTHENTICATE, "Bearer");
        write(ApiError.UNAUTHORIZED, "Se requiere un token JWT válido en la cabecera Authorization", request, response);
    }

    @Override
    public void handle(HttpServletRequest request, HttpServletResponse response, AccessDeniedException ex)
            throws IOException {
        write(ApiError.FORBIDDEN, "No cuenta con los permisos necesarios para este recurso", request, response);
    }

    private void write(ApiError error, String detail, HttpServletRequest request, HttpServletResponse response)
            throws IOException {
        response.setStatus(error.status().value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        objectMapper.writeValue(response.getOutputStream(), problemDetailFactory.create(error, detail, request));
    }
}
