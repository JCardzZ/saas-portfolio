package dev.portfolio.infrastructure.security;

import dev.portfolio.application.port.out.TelemetryPort;
import dev.portfolio.domain.model.TelemetryEventType;
import io.jsonwebtoken.JwtException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpHeaders;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.stream.Collectors;

/**
 * No es un {@code @Component} a propósito: Spring Boot lo registraría también
 * como filtro del servlet, fuera de la cadena de seguridad. Se instancia en SecurityConfig.
 */
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private static final String BEARER_PREFIX = "Bearer ";

    private final JwtTokenService tokenService;
    private final AuthenticationEntryPoint authenticationEntryPoint;
    private final TelemetryPort telemetry;

    public JwtAuthenticationFilter(JwtTokenService tokenService,
                                   AuthenticationEntryPoint authenticationEntryPoint,
                                   TelemetryPort telemetry) {
        this.tokenService = tokenService;
        this.authenticationEntryPoint = authenticationEntryPoint;
        this.telemetry = telemetry;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        String header = request.getHeader(HttpHeaders.AUTHORIZATION);
        if (header == null || !header.startsWith(BEARER_PREFIX)) {
            filterChain.doFilter(request, response);
            return;
        }

        try {
            Authentication authentication = tokenService.authenticate(header.substring(BEARER_PREFIX.length()));
            SecurityContext context = SecurityContextHolder.createEmptyContext();
            context.setAuthentication(authentication);
            SecurityContextHolder.setContext(context);
            // Solo los roles: el canal de telemetría es público y no debe revelar quién se autentica.
            telemetry.publish(TelemetryEventType.JWT_VERIFIED, authentication.getAuthorities().stream()
                    .map(GrantedAuthority::getAuthority).collect(Collectors.joining(", ")));
        } catch (JwtException | IllegalArgumentException e) {
            SecurityContextHolder.clearContext();
            authenticationEntryPoint.commence(request, response,
                    new BadCredentialsException("Token JWT inválido o expirado", e));
            return;
        }

        filterChain.doFilter(request, response);
    }
}
