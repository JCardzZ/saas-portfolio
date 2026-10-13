package dev.portfolio.application.service;

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
import dev.portfolio.testsupport.InMemoryAccess;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class UserAccessServiceTest {

    private static final String PASSWORD = "una-clave-larga-1";
    private static final Duration ACCESS = Duration.ofMinutes(15);
    private static final Duration REFRESH = Duration.ofDays(7);

    /** Reloj que se puede adelantar. */
    private static final class MovingClock extends Clock {
        private Instant now = Instant.parse("2026-10-12T10:00:00Z");

        void advance(Duration by) {
            now = now.plus(by);
        }

        @Override
        public Instant instant() {
            return now;
        }

        @Override
        public java.time.ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(java.time.ZoneId zone) {
            return this;
        }
    }

    /** Hash de mentira, rápido: los tests no comprueban BCrypt sino las reglas. */
    private static final class Hasher implements PasswordHasherPort {
        int comparisons;

        @Override
        public String hash(String password) {
            return "hash(" + password + ")";
        }

        @Override
        public boolean matches(String password, String hash) {
            comparisons++;
            return hash.equals(hash(password));
        }
    }

    private final InMemoryAccess.Users users = new InMemoryAccess.Users();
    private final InMemoryAccess.Tokens tokens = new InMemoryAccess.Tokens();
    private final Hasher hasher = new Hasher();
    private final MovingClock clock = new MovingClock();
    private final List<String> limited = new ArrayList<>();
    private final List<Duration> issuedFor = new ArrayList<>();
    private boolean allow = true;
    private UserAccessService service;

    @BeforeEach
    void setUp() {
        RateLimiterPort limiter = (key, policy) -> {
            limited.add(key);
            return new RateLimitDecision(allow, policy.maxRequests(), allow ? 4 : 0, allow ? Duration.ZERO : Duration.ofSeconds(30));
        };
        TokenIssuerPort issuer = new TokenIssuerPort() {
            @Override
            public AccessToken issue(ClientIdentity identity) {
                return issue(identity, Duration.ofHours(1));
            }

            @Override
            public AccessToken issue(ClientIdentity identity, Duration timeToLive) {
                issuedFor.add(timeToLive);
                return new AccessToken("jwt:" + identity.subject() + ":" + identity.roles(), timeToLive.toSeconds());
            }
        };
        service = new UserAccessService(users, tokens, hasher, issuer, limiter, new RateLimitPolicy(5, Duration.ofMinutes(1)), ACCESS, REFRESH, clock);
    }

    private UserAccountDomain account(String email, Role role) {
        return service.create(email, "Nombre", PASSWORD, role);
    }

    @Test
    void signsInWithAShortAccessTokenAndAnOpaqueRefreshTokenStoredOnlyAsAHash() {
        UserAccountDomain ana = account("Ana@Example.com ", Role.EDITOR);

        SessionDomain session = service.login("ana@example.com", PASSWORD, "10.0.0.1");

        assertThat(ana.email()).isEqualTo("ana@example.com");
        assertThat(session.accessToken().value()).isEqualTo("jwt:" + ana.id() + ":[ROLE_EDITOR]");
        assertThat(session.accessToken().expiresInSeconds()).isEqualTo(900);
        assertThat(issuedFor).containsExactly(ACCESS);
        assertThat(session.refreshExpiresInSeconds()).isEqualTo(604_800);
        assertThat(session.user()).isEqualTo(new UserProfileDomain(ana.id(), "ana@example.com", "Nombre", Role.EDITOR));
        assertThat(session.refreshToken()).hasSizeGreaterThanOrEqualTo(40).doesNotContain(".");
        assertThat(tokens.byHash).doesNotContainKey(session.refreshToken()).hasSize(1);
        assertThat(tokens.byHash.values().iterator().next().expiresAt()).isEqualTo(clock.instant().plus(REFRESH));
        assertThat(limited).containsExactly("auth-login:10.0.0.1");
    }

    @Test
    void aWrongPasswordAnUnknownEmailAndADeactivatedAccountGetTheSameAnswerAndTheSameWork() {
        UserAccountDomain ana = account("ana@example.com", Role.EDITOR);
        hasher.comparisons = 0;

        assertThatThrownBy(() -> service.login("ana@example.com", "otra-clave-larga", "ip"))
                .isInstanceOf(InvalidCredentialsException.class).hasMessage("Correo o contraseña incorrectos");
        assertThatThrownBy(() -> service.login("nadie@example.com", PASSWORD, "ip"))
                .isInstanceOf(InvalidCredentialsException.class).hasMessage("Correo o contraseña incorrectos");
        assertThatThrownBy(() -> service.login("no es un correo", PASSWORD, "ip"))
                .isInstanceOf(InvalidCredentialsException.class).hasMessage("Correo o contraseña incorrectos");
        service.update(ana.id(), new UserChange(null, null, null, false), "otro");
        assertThatThrownBy(() -> service.login("ana@example.com", PASSWORD, "ip"))
                .isInstanceOf(InvalidCredentialsException.class).hasMessage("Correo o contraseña incorrectos");

        // Se compara siempre un hash, exista o no la cuenta: la respuesta no delata qué correos existen.
        assertThat(hasher.comparisons).isEqualTo(4);
        assertThat(tokens.byHash).isEmpty();
    }

    @Test
    void everyAttemptCountsAgainstTheLimitBeforeTheCredentialsAreLookedAt() {
        account("ana@example.com", Role.EDITOR);
        hasher.comparisons = 0;
        allow = false;

        assertThatThrownBy(() -> service.login("ana@example.com", PASSWORD, "10.0.0.9")).isInstanceOf(RateLimitExceededException.class);
        assertThatThrownBy(() -> service.refresh("lo-que-sea", "10.0.0.9")).isInstanceOf(RateLimitExceededException.class);

        assertThat(hasher.comparisons).isZero();
        assertThat(limited).containsExactly("auth-login:10.0.0.9", "auth-refresh:10.0.0.9");
    }

    @Test
    void refreshingRotatesTheTokenAndTheOldOneStopsWorking() {
        UserAccountDomain ana = account("ana@example.com", Role.EDITOR);
        SessionDomain first = service.login("ana@example.com", PASSWORD, "ip");

        SessionDomain second = service.refresh(first.refreshToken(), "ip");

        assertThat(second.refreshToken()).isNotEqualTo(first.refreshToken());
        assertThat(second.user().subject()).isEqualTo(ana.id());
        assertThat(tokens.live(ana.id())).isEqualTo(1);
    }

    @Test
    void presentingAUsedRefreshTokenClosesEverySessionOfThatPerson() {
        UserAccountDomain ana = account("ana@example.com", Role.EDITOR);
        SessionDomain first = service.login("ana@example.com", PASSWORD, "ip");
        SessionDomain second = service.refresh(first.refreshToken(), "ip");
        service.login("ana@example.com", PASSWORD, "otro-dispositivo");
        assertThat(tokens.live(ana.id())).isEqualTo(2);

        assertThatThrownBy(() -> service.refresh(first.refreshToken(), "ip"))
                .isInstanceOf(InvalidCredentialsException.class).hasMessage("La sesión ha caducado o ya no es válida");

        assertThat(tokens.live(ana.id())).isZero();
        assertThatThrownBy(() -> service.refresh(second.refreshToken(), "ip")).isInstanceOf(InvalidCredentialsException.class);
    }

    @Test
    void anExpiredOrUnknownRefreshTokenOrOneOfADeactivatedAccountIsRejected() {
        UserAccountDomain ana = account("ana@example.com", Role.EDITOR);
        SessionDomain session = service.login("ana@example.com", PASSWORD, "ip");

        assertThatThrownBy(() -> service.refresh("no-existe", "ip")).isInstanceOf(InvalidCredentialsException.class);
        assertThatThrownBy(() -> service.refresh(null, "ip")).isInstanceOf(InvalidCredentialsException.class);

        clock.advance(REFRESH);
        assertThatThrownBy(() -> service.refresh(session.refreshToken(), "ip")).isInstanceOf(InvalidCredentialsException.class);

        clock.advance(Duration.ofSeconds(1));
        SessionDomain later = service.login("ana@example.com", PASSWORD, "ip");
        users.byId.put(ana.id(), new StoredUser(new UserAccountDomain(ana.id(), ana.email(), ana.displayName(), ana.role(), false, ana.createdAt()), "x"));
        assertThatThrownBy(() -> service.refresh(later.refreshToken(), "ip")).isInstanceOf(InvalidCredentialsException.class);
    }

    @Test
    void signingOutRevokesTheRefreshTokenAndNeverSaysWhetherItExisted() {
        UserAccountDomain ana = account("ana@example.com", Role.EDITOR);
        SessionDomain session = service.login("ana@example.com", PASSWORD, "ip");

        service.logout(session.refreshToken());
        service.logout("no-existe");

        assertThat(tokens.live(ana.id())).isZero();
        assertThatThrownBy(() -> service.refresh(session.refreshToken(), "ip")).isInstanceOf(InvalidCredentialsException.class);
    }

    @Test
    void createsAccountsOnlyWithAValidEmailANameAStrongEnoughPasswordAndAFreeEmail() {
        account("ana@example.com", Role.EDITOR);

        assertThatThrownBy(() -> service.create("ANA@example.com", "Otra", PASSWORD, Role.VIEWER)).isInstanceOf(InvalidRequestException.class)
                .hasMessage("Ya hay una cuenta con ese correo");
        assertThatThrownBy(() -> service.create("sin-arroba", "Nombre", PASSWORD, Role.VIEWER)).isInstanceOf(InvalidRequestException.class);
        assertThatThrownBy(() -> service.create("b@example.com", "  ", PASSWORD, Role.VIEWER)).isInstanceOf(InvalidRequestException.class);
        assertThatThrownBy(() -> service.create("b@example.com", "Nombre", "corta", Role.VIEWER)).isInstanceOf(InvalidRequestException.class);
        // BCrypt solo usa 72 bytes: una contraseña más larga se truncaría sin avisar.
        assertThatThrownBy(() -> service.create("b@example.com", "Nombre", "ñ".repeat(37), Role.VIEWER)).isInstanceOf(InvalidRequestException.class);
        assertThatThrownBy(() -> service.create("b@example.com", "Nombre", PASSWORD, null)).isInstanceOf(InvalidRequestException.class);

        assertThat(users.byId).hasSize(1);
        assertThat(users.byId.values().iterator().next().passwordHash()).isEqualTo("hash(" + PASSWORD + ")");
    }

    @Test
    void changingTheRoleThePasswordOrTheStateClosesThatPersonsSessions() {
        UserAccountDomain ana = account("ana@example.com", Role.EDITOR);
        service.login("ana@example.com", PASSWORD, "ip");

        UserAccountDomain renamed = service.update(ana.id(), new UserChange("Ana Pérez", null, null, null), "admin");
        assertThat(renamed.displayName()).isEqualTo("Ana Pérez");
        assertThat(tokens.live(ana.id())).as("cambiar el nombre no cierra la sesión").isEqualTo(1);

        service.update(ana.id(), new UserChange(null, null, Role.VIEWER, null), "admin");
        assertThat(tokens.live(ana.id())).isZero();

        service.login("ana@example.com", PASSWORD, "ip");
        service.update(ana.id(), new UserChange(null, "otra-clave-muy-larga", null, null), "admin");
        assertThat(tokens.live(ana.id())).isZero();
        assertThatThrownBy(() -> service.login("ana@example.com", PASSWORD, "ip")).isInstanceOf(InvalidCredentialsException.class);
        assertThat(service.login("ana@example.com", "otra-clave-muy-larga", "ip").user().role()).isEqualTo(Role.VIEWER);

        assertThatThrownBy(() -> service.update(ana.id(), new UserChange(null, "corta", null, null), "admin")).isInstanceOf(InvalidRequestException.class);
        assertThatThrownBy(() -> service.update("no-existe", new UserChange("x", null, null, null), "admin")).isInstanceOf(ResourceNotFoundException.class);
    }

    @Test
    void thereIsAlwaysAnActiveAdministratorAndNobodyRemovesTheirOwnAccess() {
        UserAccountDomain root = account("root@example.com", Role.ADMIN);

        assertThatThrownBy(() -> service.update(root.id(), new UserChange(null, null, Role.EDITOR, null), "cliente-de-maquina"))
                .isInstanceOf(InvalidRequestException.class).hasMessage("Tiene que quedar al menos un administrador activo");
        assertThatThrownBy(() -> service.update(root.id(), new UserChange(null, null, null, false), "cliente-de-maquina"))
                .isInstanceOf(InvalidRequestException.class);

        UserAccountDomain second = account("otra@example.com", Role.ADMIN);
        assertThatThrownBy(() -> service.update(root.id(), new UserChange(null, null, null, false), root.id()))
                .isInstanceOf(InvalidRequestException.class).hasMessage("No puedes quitarte a ti mismo el acceso de administrador");
        assertThat(service.update(root.id(), new UserChange(null, null, Role.EDITOR, null), second.id()).role()).isEqualTo(Role.EDITOR);
    }

    @Test
    void createsTheFirstAdministratorOnlyWhileThereAreNoAccounts() {
        assertThat(service.bootstrapAdmin("root@example.com", PASSWORD)).isTrue();
        assertThat(service.bootstrapAdmin("otro@example.com", PASSWORD)).isFalse();

        assertThat(users.findAll()).singleElement().satisfies(account -> {
            assertThat(account.email()).isEqualTo("root@example.com");
            assertThat(account.role()).isEqualTo(Role.ADMIN);
        });
        assertThatThrownBy(() -> new UserAccessService(new InMemoryAccess.Users(), tokens, hasher, null, null, null, ACCESS, REFRESH, clock)
                .bootstrapAdmin("root@example.com", "corta")).isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void describesTheCallerAsAPersonOrAsAMachineClient() {
        UserAccountDomain ana = account("ana@example.com", Role.EDITOR);

        assertThat(service.profile(ana.id(), List.of("ROLE_EDITOR", "cms:read"))).isEqualTo(UserProfileDomain.of(ana));
        assertThat(service.profile("admin-ui", List.of("ROLE_ADMIN")))
                .isEqualTo(new UserProfileDomain("admin-ui", null, "admin-ui", Role.ADMIN));
        assertThatThrownBy(() -> service.profile("alguien", List.of("ROLE_DESCONOCIDO"))).isInstanceOf(InvalidCredentialsException.class);
    }
}
