package dev.portfolio.infrastructure.adapter.in.web.mapper;

import dev.portfolio.domain.model.AccessToken;
import dev.portfolio.domain.model.ClientCredentials;
import dev.portfolio.model.TokenIntrospection;
import dev.portfolio.model.TokenRequest;
import dev.portfolio.model.TokenResponse;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.ReportingPolicy;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;

@Mapper(componentModel = "spring", unmappedTargetPolicy = ReportingPolicy.ERROR)
public interface AuthWebMapper {

    ClientCredentials toDomain(TokenRequest request);

    @Mapping(target = "accessToken", source = "value")
    TokenResponse toDto(AccessToken token);

    default TokenIntrospection toIntrospection(Authentication authentication) {
        return new TokenIntrospection()
                .active(authentication.isAuthenticated())
                .subject(authentication.getName())
                .roles(authentication.getAuthorities().stream().map(GrantedAuthority::getAuthority).toList());
    }
}
