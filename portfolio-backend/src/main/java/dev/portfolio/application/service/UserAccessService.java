package dev.portfolio.application.service;

import dev.portfolio.application.port.in.UserAdminUseCase;
import dev.portfolio.application.port.in.UserSessionUseCase;
import dev.portfolio.application.port.out.PasswordHasherPort;
import dev.portfolio.application.port.out.RateLimiterPort;
import dev.portfolio.application.port.out.RefreshTokenRepositoryPort;
import dev.portfolio.application.port.out.TokenIssuerPort;
import dev.portfolio.application.port.out.UserRepositoryPort;
import dev.portfolio.domain.exception.InvalidCredentialsException;
import dev.portfolio.domain.exception.InvalidRequestException;
import dev.portfolio.domain.exception.RateLimitExceededException;
import dev.portfolio.domain.exception.ResourceNotFoundException;
import dev.portfolio.domain.model.AccessToken;
import dev.portfolio.domain.model.ClientIdentity;
import dev.portfolio.domain.model.RateLimitDecision;
import dev.portfolio.domain.model.RateLimitPolicy;
import dev.portfolio.domain.model.access.RefreshTokenDomain;
import dev.portfolio.domain.model.access.Role;
import dev.portfolio.domain.model.access.SessionDomain;
import dev.portfolio.domain.model.access.StoredUser;
import dev.portfolio.domain.model.access.UserAccountDomain;
import dev.portfolio.domain.model.access.UserChange;
import dev.portfolio.domain.model.access.UserProfileDomain;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Usuarios y sesiones. Una persona entra con correo y contraseña y recibe un token de acceso de
 * vida corta y uno de refresco, opaco y de un solo uso, del que el servidor solo guarda el hash.
 *
 * Decisiones de seguridad:
 * - un correo que no existe y una contraseña incorrecta responden igual y tardan lo mismo (se
 *   comprueba siempre un hash, aunque no haya cuenta);
 * - cada intento de entrar o renovar cuenta para el límite por origen, acierte o no;
 * - presentar un token de refresco ya usado se trata como robo: se cierran todas las sesiones
 *   de esa persona;
 * - desactivar una cuenta o cambiar su contraseña cierra sus sesiones; el token de acceso que
 *   ya tenga sigue valiendo hasta que caduque, por eso dura poco.
 */
public class UserAccessService implements UserSessionUseCase, UserAdminUseCase {

    private static final String LOGIN_LIMIT_PREFIX = "auth-login:";
    private static final String REFRESH_LIMIT_PREFIX = "auth-refresh:";
    private static final String INVALID_LOGIN = "Correo o contraseña incorrectos";
    private static final String INVALID_SESSION = "La sesión ha caducado o ya no es válida";
    private static final int REFRESH_TOKEN_BYTES = 32;

    private final UserRepositoryPort users;
    private final RefreshTokenRepositoryPort refreshTokens;
    private final PasswordHasherPort hasher;
    private final TokenIssuerPort tokenIssuer;
    private final RateLimiterPort rateLimiter;
    private final RateLimitPolicy loginPolicy;
    private final Duration accessTtl;
    private final Duration refreshTtl;
    private final Clock clock;
    private final SecureRandom random = new SecureRandom();
    /** Hash contra el que se compara cuando el correo no existe, para que la respuesta tarde lo mismo. */
    private final String decoyHash;

    public UserAccessService(UserRepositoryPort users, RefreshTokenRepositoryPort refreshTokens, PasswordHasherPort hasher,
                             TokenIssuerPort tokenIssuer, RateLimiterPort rateLimiter, RateLimitPolicy loginPolicy,
                             Duration accessTtl, Duration refreshTtl, Clock clock) {
        this.users = users;
        this.refreshTokens = refreshTokens;
        this.hasher = hasher;
        this.tokenIssuer = tokenIssuer;
        this.rateLimiter = rateLimiter;
        this.loginPolicy = loginPolicy;
        this.accessTtl = accessTtl;
        this.refreshTtl = refreshTtl;
        this.clock = clock;
        this.decoyHash = hasher.hash(newOpaqueToken());
    }

    // ---------- Sesiones ----------

    @Override
    public SessionDomain login(String email, String password, String clientAddress) {
        limit(LOGIN_LIMIT_PREFIX + clientAddress);
        Optional<StoredUser> stored = normalized(email).flatMap(users::findByEmail);
        boolean matches = hasher.matches(password == null ? "" : password, stored.map(StoredUser::passwordHash).orElse(decoyHash));
        if (stored.isEmpty() || !matches || !stored.get().account().active()) {
            throw new InvalidCredentialsException(INVALID_LOGIN);
        }
        return open(stored.get().account());
    }

    @Override
    public SessionDomain refresh(String refreshToken, String clientAddress) {
        limit(REFRESH_LIMIT_PREFIX + clientAddress);
        Instant now = clock.instant();
        String hash = sha256(refreshToken);
        RefreshTokenDomain stored = refreshTokens.findByHash(hash).orElseThrow(() -> new InvalidCredentialsException(INVALID_SESSION));
        if (stored.revoked()) {
            // Un token de un solo uso que vuelve a aparecer: alguien más lo tiene.
            refreshTokens.revokeAllOf(stored.userId(), now);
            throw new InvalidCredentialsException(INVALID_SESSION);
        }
        if (stored.expiredAt(now) || !refreshTokens.revoke(hash, now)) {
            throw new InvalidCredentialsException(INVALID_SESSION);
        }
        UserAccountDomain account = users.findById(stored.userId()).filter(UserAccountDomain::active)
                .orElseThrow(() -> new InvalidCredentialsException(INVALID_SESSION));
        return open(account);
    }

    @Override
    public void logout(String refreshToken) {
        refreshTokens.revoke(sha256(refreshToken), clock.instant());
    }

    @Override
    public UserProfileDomain profile(String subject, List<String> authorities) {
        Role role = authorities.stream().map(Role::fromAuthority).flatMap(Optional::stream).findFirst()
                .orElseThrow(() -> new InvalidCredentialsException(INVALID_SESSION));
        return users.findById(subject).map(UserProfileDomain::of).orElseGet(() -> UserProfileDomain.machine(subject, role));
    }

    private SessionDomain open(UserAccountDomain account) {
        AccessToken access = tokenIssuer.issue(new ClientIdentity(account.id(), List.of(account.role().authority())), accessTtl);
        String refresh = newOpaqueToken();
        refreshTokens.save(new RefreshTokenDomain(sha256(refresh), account.id(), clock.instant().plus(refreshTtl), null));
        return new SessionDomain(access, refresh, refreshTtl.toSeconds(), UserProfileDomain.of(account));
    }

    private void limit(String key) {
        RateLimitDecision decision = rateLimiter.tryAcquire(key, loginPolicy);
        if (!decision.allowed()) {
            throw new RateLimitExceededException(decision.limit(), decision.retryAfter());
        }
    }

    // ---------- Cuentas ----------

    @Override
    public List<UserAccountDomain> findAll() {
        return users.findAll();
    }

    @Override
    public UserAccountDomain create(String email, String displayName, String password, Role role) {
        String normalizedEmail = UserAccountDomain.normalizeEmail(email);
        String name = UserAccountDomain.normalizeName(displayName);
        UserAccountDomain.checkPassword(password);
        if (role == null) {
            throw new InvalidRequestException("El rol es obligatorio");
        }
        if (users.existsByEmail(normalizedEmail)) {
            throw new InvalidRequestException("Ya hay una cuenta con ese correo");
        }
        UserAccountDomain account = new UserAccountDomain(UUID.randomUUID().toString(), normalizedEmail, name, role, true, clock.instant());
        return users.create(account, hasher.hash(password));
    }

    @Override
    public UserAccountDomain update(String id, UserChange change, String actorSubject) {
        UserAccountDomain current = users.findById(id).orElseThrow(() -> new ResourceNotFoundException("Usuario", id));
        Role role = change.role() == null ? current.role() : change.role();
        boolean active = change.active() == null ? current.active() : change.active();
        boolean losesAdmin = current.role() == Role.ADMIN && current.active() && (role != Role.ADMIN || !active);
        if (losesAdmin && id.equals(actorSubject)) {
            throw new InvalidRequestException("No puedes quitarte a ti mismo el acceso de administrador");
        }
        if (losesAdmin && users.countActiveAdminsExcept(id) == 0) {
            throw new InvalidRequestException("Tiene que quedar al menos un administrador activo");
        }
        String name = change.displayName() == null ? current.displayName() : UserAccountDomain.normalizeName(change.displayName());
        String passwordHash = null;
        if (change.password() != null) {
            UserAccountDomain.checkPassword(change.password());
            passwordHash = hasher.hash(change.password());
        }
        UserAccountDomain updated = users.update(
                new UserAccountDomain(id, current.email(), name, role, active, current.createdAt()), passwordHash);
        // Quien pierde el acceso, cambia de rol o de contraseña tiene que volver a entrar.
        if (!active || passwordHash != null || role != current.role()) {
            refreshTokens.revokeAllOf(id, clock.instant());
        }
        return updated;
    }

    @Override
    public boolean bootstrapAdmin(String email, String password) {
        if (users.count() > 0) {
            return false;
        }
        create(email, "Administrador", password, Role.ADMIN);
        return true;
    }

    // ---------- Utilidades ----------

    private static Optional<String> normalized(String email) {
        try {
            return Optional.of(UserAccountDomain.normalizeEmail(email));
        } catch (InvalidRequestException e) {
            return Optional.empty();
        }
    }

    private String newOpaqueToken() {
        byte[] bytes = new byte[REFRESH_TOKEN_BYTES];
        random.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private static String sha256(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest((value == null ? "" : value).getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
