package dev.portfolio.infrastructure.security;

import dev.portfolio.application.port.out.TokenIssuerPort;
import dev.portfolio.domain.model.AccessToken;
import dev.portfolio.domain.model.ClientIdentity;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import java.util.List;

@Component
public class JwtTokenService implements TokenIssuerPort {

    static final String ROLES_CLAIM = "roles";

    private final SecretKey key;
    private final Duration expiration;

    public JwtTokenService(JwtProperties properties) {
        this.key = Keys.hmacShaKeyFor(Decoders.BASE64.decode(properties.secret()));
        this.expiration = properties.expiration();
    }

    @Override
    public AccessToken issue(ClientIdentity identity) {
        Instant now = Instant.now();
        String token = Jwts.builder()
                .subject(identity.subject())
                .claim(ROLES_CLAIM, identity.roles())
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plus(expiration)))
                .signWith(key)
                .compact();
        return new AccessToken(token, expiration.toSeconds());
    }

    /**
     * Valida firma y expiración y construye la autenticación a partir del
     * subject y del claim {@code roles} (p. ej. {@code ["ROLE_ADMIN"]}).
     *
     * @throws JwtException si el token es inválido, está expirado o no declara expiración
     */
    public Authentication authenticate(String token) {
        Claims claims = Jwts.parser().verifyWith(key).build().parseSignedClaims(token).getPayload();
        if (claims.getSubject() == null || claims.getExpiration() == null) {
            throw new JwtException("Token sin subject o sin expiración");
        }
        List<?> roles = claims.get(ROLES_CLAIM, List.class);
        List<SimpleGrantedAuthority> authorities = roles == null
                ? List.of()
                : roles.stream().map(role -> new SimpleGrantedAuthority(String.valueOf(role))).toList();
        return UsernamePasswordAuthenticationToken.authenticated(claims.getSubject(), null, authorities);
    }
}
