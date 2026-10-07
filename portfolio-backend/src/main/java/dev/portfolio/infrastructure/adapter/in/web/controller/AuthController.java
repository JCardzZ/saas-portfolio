package dev.portfolio.infrastructure.adapter.in.web.controller;

import dev.portfolio.api.AuthRbacApi;
import dev.portfolio.application.port.in.AuthUseCase;
import dev.portfolio.infrastructure.adapter.in.web.mapper.AuthWebMapper;
import dev.portfolio.model.TokenIntrospection;
import dev.portfolio.model.TokenRequest;
import dev.portfolio.model.TokenResponse;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
public class AuthController implements AuthRbacApi {

    private final AuthUseCase authUseCase;
    private final AuthWebMapper mapper;
    private final HttpServletRequest request;

    @Override
    public ResponseEntity<TokenResponse> generateToken(TokenRequest tokenRequest) {
        return ResponseEntity.ok(mapper.toDto(
                authUseCase.issueToken(mapper.toDomain(tokenRequest), request.getRemoteAddr())));
    }

    @Override
    public ResponseEntity<TokenIntrospection> validateToken() {
        return ResponseEntity.ok(mapper.toIntrospection(SecurityContextHolder.getContext().getAuthentication()));
    }
}
