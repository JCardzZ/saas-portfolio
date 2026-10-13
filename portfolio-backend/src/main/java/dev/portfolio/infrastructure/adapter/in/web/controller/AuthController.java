package dev.portfolio.infrastructure.adapter.in.web.controller;

import dev.portfolio.application.port.in.UserSessionUseCase;
import dev.portfolio.infrastructure.adapter.in.web.mapper.UserWebMapper;
import dev.portfolio.model.LoginRequest;
import dev.portfolio.model.RefreshRequest;
import dev.portfolio.model.SessionResponse;
import dev.portfolio.model.UserProfile;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
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
    private final UserSessionUseCase sessions;
    private final UserWebMapper userMapper;
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

    @Override
    public ResponseEntity<SessionResponse> loginUser(LoginRequest loginRequest) {
        return ResponseEntity.ok(userMapper.toDto(
                sessions.login(loginRequest.getEmail(), loginRequest.getPassword(), request.getRemoteAddr())));
    }

    @Override
    public ResponseEntity<SessionResponse> refreshSession(RefreshRequest refreshRequest) {
        return ResponseEntity.ok(userMapper.toDto(sessions.refresh(refreshRequest.getRefreshToken(), request.getRemoteAddr())));
    }

    @Override
    public ResponseEntity<Void> logoutSession(RefreshRequest refreshRequest) {
        sessions.logout(refreshRequest.getRefreshToken());
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<UserProfile> currentUser() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        return ResponseEntity.ok(userMapper.toDto(sessions.profile(authentication.getName(),
                authentication.getAuthorities().stream().map(GrantedAuthority::getAuthority).toList())));
    }
}
