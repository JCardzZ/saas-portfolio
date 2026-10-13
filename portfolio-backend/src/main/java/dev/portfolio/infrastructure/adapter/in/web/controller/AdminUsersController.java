package dev.portfolio.infrastructure.adapter.in.web.controller;

import dev.portfolio.api.AdminUsersApi;
import dev.portfolio.application.port.in.UserAdminUseCase;
import dev.portfolio.infrastructure.adapter.in.web.mapper.UserWebMapper;
import dev.portfolio.model.RoleDefinition;
import dev.portfolio.model.UserAccount;
import dev.portfolio.model.UserCreateRequest;
import dev.portfolio.model.UserUpdateRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** Gestión de usuarios. Quién puede llamar aquí lo decide `AccessRules` (permiso `users:manage`). */
@RestController
@RequiredArgsConstructor
public class AdminUsersController implements AdminUsersApi {

    private final UserAdminUseCase users;
    private final UserWebMapper mapper;

    @Override
    public ResponseEntity<List<RoleDefinition>> listRoles() {
        return ResponseEntity.ok(mapper.roles());
    }

    @Override
    public ResponseEntity<List<UserAccount>> listUsers() {
        return ResponseEntity.ok(users.findAll().stream().map(mapper::toDto).toList());
    }

    @Override
    public ResponseEntity<UserAccount> createUser(UserCreateRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(mapper.toDto(
                users.create(request.getEmail(), request.getDisplayName(), request.getPassword(), mapper.toDomain(request.getRole()))));
    }

    @Override
    public ResponseEntity<UserAccount> updateUser(String id, UserUpdateRequest request) {
        String actor = SecurityContextHolder.getContext().getAuthentication().getName();
        return ResponseEntity.ok(mapper.toDto(users.update(id, mapper.toDomain(request), actor)));
    }
}
