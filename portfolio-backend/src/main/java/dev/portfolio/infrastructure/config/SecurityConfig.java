package dev.portfolio.infrastructure.config;

import dev.portfolio.application.port.out.TelemetryPort;
import dev.portfolio.infrastructure.adapter.in.web.error.GlobalExceptionHandler;
import dev.portfolio.infrastructure.security.AdminClientProperties;
import dev.portfolio.infrastructure.security.CorsProperties;
import dev.portfolio.infrastructure.security.JwtAuthenticationFilter;
import dev.portfolio.infrastructure.security.JwtProperties;
import dev.portfolio.infrastructure.security.JwtTokenService;
import dev.portfolio.infrastructure.security.ProblemDetailSecurityHandler;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpHeaders;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.time.Duration;
import java.util.List;

@Configuration
@EnableWebSecurity
@EnableConfigurationProperties({JwtProperties.class, AdminClientProperties.class, CorsProperties.class})
public class SecurityConfig {

    // Rutas relativas al context-path (/v1). Públicas = operaciones sin `security` en el contrato OpenAPI.
    private static final String[] PUBLIC_ENDPOINTS = {
            "/public/**",
            "/telemetry/**",
            "/auth/token",
            "/recruiter/track-ingress",
            "/ai/rag/query",
            "/ai/architecture/copilot"
    };

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http,
                                                   JwtTokenService tokenService,
                                                   ProblemDetailSecurityHandler securityHandler,
                                                   CorsConfigurationSource corsConfigurationSource,
                                                   TelemetryPort telemetry) throws Exception {
        return http
            .cors(cors -> cors.configurationSource(corsConfigurationSource))
            .csrf(AbstractHttpConfigurer::disable)
            .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .exceptionHandling(handling -> handling
                .authenticationEntryPoint(securityHandler)
                .accessDeniedHandler(securityHandler)
            )
            .authorizeHttpRequests(auth -> auth
                .requestMatchers(PUBLIC_ENDPOINTS).permitAll()
                .requestMatchers("/admin/**").hasRole("ADMIN")
                .anyRequest().authenticated()
            )
            .addFilterBefore(new JwtAuthenticationFilter(tokenService, securityHandler, telemetry),
                UsernamePasswordAuthenticationFilter.class)
            .build();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource(CorsProperties properties) {
        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOrigins(properties.allowedOrigins());
        configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS"));
        configuration.setAllowedHeaders(List.of(HttpHeaders.AUTHORIZATION, HttpHeaders.CONTENT_TYPE, HttpHeaders.ACCEPT));
        // Sin esto el navegador oculta estas cabeceras al frontend en un 429.
        configuration.setExposedHeaders(List.of(HttpHeaders.RETRY_AFTER,
                GlobalExceptionHandler.RATE_LIMIT_LIMIT_HEADER, GlobalExceptionHandler.RATE_LIMIT_REMAINING_HEADER));
        // El token viaja en la cabecera Authorization, no en cookies.
        configuration.setAllowCredentials(false);
        configuration.setMaxAge(Duration.ofHours(1));

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }
}
