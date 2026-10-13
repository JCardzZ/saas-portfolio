package dev.portfolio.infrastructure.adapter.in.web;

import com.jayway.jsonpath.JsonPath;
import dev.portfolio.application.port.in.AuthUseCase;
import dev.portfolio.application.port.in.TechnologyUseCase;
import dev.portfolio.application.port.out.RateLimiterPort;
import dev.portfolio.application.port.out.TelemetryPort;
import dev.portfolio.application.service.UserAccessService;
import dev.portfolio.domain.model.RateLimitDecision;
import dev.portfolio.domain.model.RateLimitPolicy;
import dev.portfolio.domain.model.TelemetryEventType;
import dev.portfolio.domain.model.access.Role;
import dev.portfolio.infrastructure.adapter.in.web.controller.AdminTechnologiesController;
import dev.portfolio.infrastructure.adapter.in.web.controller.AdminUsersController;
import dev.portfolio.infrastructure.adapter.in.web.controller.AuthController;
import dev.portfolio.infrastructure.adapter.in.web.error.ProblemDetailFactory;
import dev.portfolio.infrastructure.adapter.in.web.mapper.AuthWebMapperImpl;
import dev.portfolio.infrastructure.adapter.in.web.mapper.TechnologyWebMapperImpl;
import dev.portfolio.infrastructure.adapter.in.web.mapper.UserWebMapper;
import dev.portfolio.infrastructure.config.SecurityConfig;
import dev.portfolio.infrastructure.security.BCryptPasswordHasher;
import dev.portfolio.infrastructure.security.JwtTokenService;
import dev.portfolio.infrastructure.security.ProblemDetailSecurityHandler;
import dev.portfolio.testsupport.InMemoryAccess;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.time.Clock;
import java.time.Duration;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.not;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Usuarios, sesiones y permisos por HTTP, con el servicio real, BCrypt real, tokens reales y la
 * cadena de seguridad real; solo los datos están en memoria.
 */
@WebMvcTest(controllers = {AuthController.class, AdminUsersController.class, AdminTechnologiesController.class})
@Import({
        SecurityConfig.class,
        JwtTokenService.class,
        ProblemDetailSecurityHandler.class,
        ProblemDetailFactory.class,
        AuthWebMapperImpl.class,
        UserWebMapper.class,
        TechnologyWebMapperImpl.class,
        BCryptPasswordHasher.class,
        UsersApiTest.Access.class
})
@TestPropertySource(properties = {
        "security.jwt.secret=dGVzdC1vbmx5LWhtYWMta2V5LTAxMjM0NTY3ODlhYmNkZWY=",
        "security.jwt.expiration=1h",
        "security.admin-client.id=admin-ui",
        "security.admin-client.secret=s3cret-for-tests",
        "security.cors.allowed-origins=http://localhost:4200"
})
class UsersApiTest {

    private static final String PASSWORD = "una-clave-larga-1";

    @TestConfiguration
    static class Access {
        @Bean
        InMemoryAccess.Users users() {
            return new InMemoryAccess.Users();
        }

        @Bean
        InMemoryAccess.Tokens tokens() {
            return new InMemoryAccess.Tokens();
        }

        @Bean
        UserAccessService userAccessService(InMemoryAccess.Users users, InMemoryAccess.Tokens tokens, BCryptPasswordHasher hasher,
                                            JwtTokenService tokenService, RateLimiterPort rateLimiter) {
            return new UserAccessService(users, tokens, hasher, tokenService, rateLimiter, new RateLimitPolicy(5, Duration.ofMinutes(1)),
                    Duration.ofMinutes(15), Duration.ofDays(7), Clock.systemUTC());
        }
    }

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private UserAccessService service;
    @Autowired
    private InMemoryAccess.Users users;
    @Autowired
    private InMemoryAccess.Tokens tokens;

    @MockBean
    private AuthUseCase authUseCase;
    @MockBean
    private TechnologyUseCase technologyUseCase;
    @MockBean
    private TelemetryPort telemetryPort;
    @MockBean
    private RateLimiterPort rateLimiterPort;

    @BeforeEach
    void setUp() {
        users.byId.clear();
        tokens.byHash.clear();
        when(rateLimiterPort.tryAcquire(anyString(), any())).thenReturn(new RateLimitDecision(true, 5, 4, Duration.ZERO));
        when(technologyUseCase.findAll()).thenReturn(List.of());
        service.create("root@example.com", "Raíz", PASSWORD, Role.ADMIN);
        service.create("editora@example.com", "Editora", PASSWORD, Role.EDITOR);
        service.create("lector@example.com", "Lector", PASSWORD, Role.VIEWER);
    }

    private MvcResult login(String email, String password) throws Exception {
        return mockMvc.perform(post("/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"%s\",\"password\":\"%s\"}".formatted(email, password))).andReturn();
    }

    private String bearer(String email) throws Exception {
        return "Bearer " + JsonPath.<String>read(login(email, PASSWORD).getResponse().getContentAsString(), "$.accessToken");
    }

    @Test
    void signingInReturnsBothTokensAndWhoYouAreWithYourPermissions() throws Exception {
        mockMvc.perform(post("/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"Editora@Example.com\",\"password\":\"%s\"}".formatted(PASSWORD)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accessToken").isNotEmpty())
                .andExpect(jsonPath("$.expiresInSeconds").value(900))
                .andExpect(jsonPath("$.refreshToken").isNotEmpty())
                .andExpect(jsonPath("$.refreshExpiresInSeconds").value(604800))
                .andExpect(jsonPath("$.user.email").value("editora@example.com"))
                .andExpect(jsonPath("$.user.role").value("EDITOR"))
                .andExpect(jsonPath("$.user.permissions", hasItem("cms:write")))
                .andExpect(jsonPath("$.user.permissions", not(hasItem("users:manage"))))
                .andExpect(content().string(not(org.hamcrest.Matchers.containsString("password"))));
    }

    @Test
    void aWrongPasswordAndAnUnknownEmailGetTheSame401() throws Exception {
        for (String[] attempt : new String[][] {{"editora@example.com", "otra-clave-larga"}, {"nadie@example.com", PASSWORD}}) {
            MvcResult result = login(attempt[0], attempt[1]);
            assertThat(result.getResponse().getStatus()).isEqualTo(401);
            assertThat(result.getResponse().getContentAsString()).contains("Correo o contraseña incorrectos").doesNotContain(attempt[1]);
        }
        mockMvc.perform(post("/auth/login").contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"editora@example.com\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void tooManyAttemptsAnswer429() throws Exception {
        when(rateLimiterPort.tryAcquire(anyString(), any())).thenReturn(new RateLimitDecision(false, 5, 0, Duration.ofSeconds(42)));

        assertThat(login("root@example.com", PASSWORD).getResponse().getStatus()).isEqualTo(429);
        ArgumentCaptor<String> key = ArgumentCaptor.forClass(String.class);
        verify(rateLimiterPort, atLeastOnce()).tryAcquire(key.capture(), any());
        assertThat(key.getValue()).startsWith("auth-login:");
    }

    @Test
    void theAccessTokenSaysWhoYouAreAndTheRefreshTokenWorksOnce() throws Exception {
        String body = login("lector@example.com", PASSWORD).getResponse().getContentAsString();
        String access = JsonPath.read(body, "$.accessToken");
        String refresh = JsonPath.read(body, "$.refreshToken");

        mockMvc.perform(get("/auth/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + access))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.displayName").value("Lector"))
                .andExpect(jsonPath("$.role").value("VIEWER"))
                .andExpect(jsonPath("$.permissions", containsInAnyOrder("cms:read", "flags:read", "analytics:read")));
        mockMvc.perform(get("/auth/me")).andExpect(status().isUnauthorized());

        String renewed = mockMvc.perform(post("/auth/refresh").contentType(MediaType.APPLICATION_JSON).content("{\"refreshToken\":\"%s\"}".formatted(refresh)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(JsonPath.<String>read(renewed, "$.refreshToken")).isNotEqualTo(refresh);
        // El mismo token otra vez: 401, y además se cierran todas las sesiones de esa persona.
        mockMvc.perform(post("/auth/refresh").contentType(MediaType.APPLICATION_JSON).content("{\"refreshToken\":\"%s\"}".formatted(refresh)))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(post("/auth/refresh").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"refreshToken\":\"%s\"}".formatted(JsonPath.<String>read(renewed, "$.refreshToken"))))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void signingOutAnswers204AndTheRefreshTokenStopsWorking() throws Exception {
        String refresh = JsonPath.read(login("lector@example.com", PASSWORD).getResponse().getContentAsString(), "$.refreshToken");

        mockMvc.perform(post("/auth/logout").contentType(MediaType.APPLICATION_JSON).content("{\"refreshToken\":\"%s\"}".formatted(refresh)))
                .andExpect(status().isNoContent());
        mockMvc.perform(post("/auth/logout").contentType(MediaType.APPLICATION_JSON).content("{\"refreshToken\":\"un-token-que-no-existe-0000\"}"))
                .andExpect(status().isNoContent());
        mockMvc.perform(post("/auth/refresh").contentType(MediaType.APPLICATION_JSON).content("{\"refreshToken\":\"%s\"}".formatted(refresh)))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void eachRoleReachesOnlyWhatItsPermissionsAllow() throws Exception {
        String admin = bearer("root@example.com");
        String editor = bearer("editora@example.com");
        String viewer = bearer("lector@example.com");
        String technology = "{\"name\":\"Kotlin\",\"category\":\"Backend\"}";

        // Leer el CMS: los tres. Escribirlo: administrador y editora.
        for (String token : List.of(admin, editor, viewer)) {
            mockMvc.perform(get("/admin/technologies").header(HttpHeaders.AUTHORIZATION, token)).andExpect(status().isOk());
        }
        mockMvc.perform(post("/admin/technologies").header(HttpHeaders.AUTHORIZATION, viewer).contentType(MediaType.APPLICATION_JSON).content(technology))
                .andExpect(status().isForbidden());
        assertThat(mockMvc.perform(post("/admin/technologies").header(HttpHeaders.AUTHORIZATION, editor).contentType(MediaType.APPLICATION_JSON).content(technology))
                .andReturn().getResponse().getStatus()).as("la editora pasa la seguridad").isNotIn(401, 403);

        // Usuarios y roles: solo el administrador.
        mockMvc.perform(get("/admin/users").header(HttpHeaders.AUTHORIZATION, admin)).andExpect(status().isOk()).andExpect(jsonPath("$", hasSize(3)));
        mockMvc.perform(get("/admin/roles").header(HttpHeaders.AUTHORIZATION, admin)).andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.role=='VIEWER')].permissions[*].code", containsInAnyOrder("cms:read", "flags:read", "analytics:read")));
        for (String token : List.of(editor, viewer)) {
            mockMvc.perform(get("/admin/users").header(HttpHeaders.AUTHORIZATION, token)).andExpect(status().isForbidden());
            mockMvc.perform(get("/admin/roles").header(HttpHeaders.AUTHORIZATION, token)).andExpect(status().isForbidden());
            // Cambiar una flag y operar la infraestructura tampoco (la ruta no tiene controlador aquí: importa que no llegue).
            mockMvc.perform(put("/admin/features/cloud.oracle").header(HttpHeaders.AUTHORIZATION, token).contentType(MediaType.APPLICATION_JSON).content("{\"enabled\":true}"))
                    .andExpect(status().isForbidden());
            mockMvc.perform(post("/admin/infrastructure/cache/purge").header(HttpHeaders.AUTHORIZATION, token)).andExpect(status().isForbidden());
        }
        mockMvc.perform(get("/admin/users")).andExpect(status().isUnauthorized());
        // El canal de telemetría es público: solo sale el rol, nunca los permisos ni quién es.
        verify(telemetryPort, atLeastOnce()).publish(TelemetryEventType.JWT_VERIFIED, "ROLE_VIEWER");
    }

    @Test
    void anAdministratorCreatesAndChangesAccountsAndThePasswordNeverComesBack() throws Exception {
        String admin = bearer("root@example.com");

        String created = mockMvc.perform(post("/admin/users").header(HttpHeaders.AUTHORIZATION, admin).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"Nueva@Example.com\",\"displayName\":\"Nueva\",\"password\":\"%s\",\"role\":\"VIEWER\"}".formatted(PASSWORD)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.email").value("nueva@example.com"))
                .andExpect(jsonPath("$.active").value(true))
                .andExpect(jsonPath("$.password").doesNotExist())
                .andExpect(jsonPath("$.passwordHash").doesNotExist())
                .andReturn().getResponse().getContentAsString();
        String id = JsonPath.read(created, "$.id");
        assertThat(users.byId.get(id).passwordHash()).startsWith("$2").doesNotContain(PASSWORD);

        mockMvc.perform(post("/admin/users").header(HttpHeaders.AUTHORIZATION, admin).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"nueva@example.com\",\"displayName\":\"Otra\",\"password\":\"%s\",\"role\":\"VIEWER\"}".formatted(PASSWORD)))
                .andExpect(status().isBadRequest());
        mockMvc.perform(post("/admin/users").header(HttpHeaders.AUTHORIZATION, admin).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"corta@example.com\",\"displayName\":\"Corta\",\"password\":\"corta\",\"role\":\"VIEWER\"}"))
                .andExpect(status().isBadRequest());
        mockMvc.perform(post("/admin/users").header(HttpHeaders.AUTHORIZATION, admin).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"rol@example.com\",\"displayName\":\"Rol\",\"password\":\"%s\",\"role\":\"ROOT\"}".formatted(PASSWORD)))
                .andExpect(status().isBadRequest());

        mockMvc.perform(put("/admin/users/" + id).header(HttpHeaders.AUTHORIZATION, admin).contentType(MediaType.APPLICATION_JSON).content("{\"role\":\"EDITOR\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.role").value("EDITOR")).andExpect(jsonPath("$.displayName").value("Nueva"));
        mockMvc.perform(put("/admin/users/" + id).header(HttpHeaders.AUTHORIZATION, admin).contentType(MediaType.APPLICATION_JSON).content("{\"active\":false}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.active").value(false));
        assertThat(login("nueva@example.com", PASSWORD).getResponse().getStatus()).isEqualTo(401);
        mockMvc.perform(put("/admin/users/no-existe").header(HttpHeaders.AUTHORIZATION, admin).contentType(MediaType.APPLICATION_JSON).content("{\"active\":false}"))
                .andExpect(status().isNotFound());
    }

    @Test
    void theLastAdministratorCannotLoseTheirAccess() throws Exception {
        String admin = bearer("root@example.com");
        String rootId = users.byId.values().stream().filter(user -> user.account().role() == Role.ADMIN).findFirst().orElseThrow().account().id();

        mockMvc.perform(put("/admin/users/" + rootId).header(HttpHeaders.AUTHORIZATION, admin).contentType(MediaType.APPLICATION_JSON).content("{\"role\":\"VIEWER\"}"))
                .andExpect(status().isBadRequest());
        mockMvc.perform(put("/admin/users/" + rootId).header(HttpHeaders.AUTHORIZATION, admin).contentType(MediaType.APPLICATION_JSON).content("{\"active\":false}"))
                .andExpect(status().isBadRequest());
        assertThat(users.byId.get(rootId).account().active()).isTrue();
    }
}
