package dev.portfolio.infrastructure.adapter.in.web.mapper;

import dev.portfolio.domain.exception.InvalidRequestException;
import dev.portfolio.domain.model.access.Permission;
import dev.portfolio.domain.model.access.Role;
import dev.portfolio.domain.model.access.SessionDomain;
import dev.portfolio.domain.model.access.UserAccountDomain;
import dev.portfolio.domain.model.access.UserChange;
import dev.portfolio.domain.model.access.UserProfileDomain;
import dev.portfolio.model.PermissionDefinition;
import dev.portfolio.model.RoleDefinition;
import dev.portfolio.model.SessionResponse;
import dev.portfolio.model.UserAccount;
import dev.portfolio.model.UserProfile;
import dev.portfolio.model.UserRole;
import dev.portfolio.model.UserUpdateRequest;
import org.springframework.stereotype.Component;

import java.time.ZoneOffset;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;

/** Usuarios, sesiones y roles entre el contrato y el dominio. El hash de la contraseña no pasa por aquí. */
@Component
public class UserWebMapper {

    public SessionResponse toDto(SessionDomain session) {
        return new SessionResponse()
                .accessToken(session.accessToken().value())
                .expiresInSeconds(Math.toIntExact(session.accessToken().expiresInSeconds()))
                .refreshToken(session.refreshToken())
                .refreshExpiresInSeconds(Math.toIntExact(session.refreshExpiresInSeconds()))
                .user(toDto(session.user()));
    }

    public UserProfile toDto(UserProfileDomain profile) {
        return new UserProfile()
                .subject(profile.subject())
                .email(profile.email())
                .displayName(profile.displayName())
                .role(toDto(profile.role()))
                .permissions(codes(profile.role()));
    }

    public UserAccount toDto(UserAccountDomain account) {
        return new UserAccount()
                .id(account.id())
                .email(account.email())
                .displayName(account.displayName())
                .role(toDto(account.role()))
                .active(account.active())
                .createdAt(account.createdAt().atOffset(ZoneOffset.UTC));
    }

    public List<RoleDefinition> roles() {
        return Arrays.stream(Role.values()).map(role -> new RoleDefinition()
                .role(toDto(role))
                .description(role.description())
                .permissions(role.permissions().stream().sorted(Comparator.comparing(Permission::ordinal))
                        .map(permission -> new PermissionDefinition().code(permission.code()).description(permission.description()))
                        .toList())).toList();
    }

    public Role toDomain(UserRole role) {
        if (role == null) {
            return null;
        }
        return Role.fromName(role.getValue()).orElseThrow(() -> new InvalidRequestException("Rol no admitido"));
    }

    public UserChange toDomain(UserUpdateRequest request) {
        return new UserChange(request.getDisplayName(), request.getPassword(), toDomain(request.getRole()), request.getActive());
    }

    private static UserRole toDto(Role role) {
        return UserRole.fromValue(role.name());
    }

    private static List<String> codes(Role role) {
        return role.permissions().stream().sorted(Comparator.comparing(Permission::ordinal)).map(Permission::code).toList();
    }
}
