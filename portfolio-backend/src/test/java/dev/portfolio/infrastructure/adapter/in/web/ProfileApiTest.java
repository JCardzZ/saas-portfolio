package dev.portfolio.infrastructure.adapter.in.web;

import dev.portfolio.application.port.in.ProfilePhotoUseCase;
import dev.portfolio.application.port.out.TelemetryPort;
import dev.portfolio.domain.exception.InvalidRequestException;
import dev.portfolio.domain.exception.ResourceNotFoundException;
import dev.portfolio.domain.model.ProfilePhotoDomain;
import dev.portfolio.infrastructure.adapter.in.web.controller.ProfileController;
import dev.portfolio.infrastructure.adapter.in.web.error.GlobalExceptionHandler;
import dev.portfolio.infrastructure.adapter.in.web.error.ProblemDetailFactory;
import dev.portfolio.infrastructure.config.SecurityConfig;
import dev.portfolio.infrastructure.security.JwtTokenService;
import dev.portfolio.infrastructure.security.ProblemDetailSecurityHandler;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.util.Date;
import java.util.List;

import static org.mockito.BDDMockito.given;
import static org.mockito.BDDMockito.willThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(controllers = ProfileController.class)
@Import({SecurityConfig.class, JwtTokenService.class, ProblemDetailSecurityHandler.class, ProblemDetailFactory.class, GlobalExceptionHandler.class})
@TestPropertySource(properties = "security.jwt.secret=" + ProfileApiTest.SECRET)
class ProfileApiTest {

    static final String SECRET = "dGVzdC1vbmx5LWhtYWMta2V5LTAxMjM0NTY3ODlhYmNkZWY=";
    private static final byte[] PNG = {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 1, 2, 3};
    private static final MockMultipartFile FILE = new MockMultipartFile("file", "yo.png", "image/png", PNG);

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private ProfilePhotoUseCase profilePhotoUseCase;

    @MockBean
    private TelemetryPort telemetryPort;

    private static String adminToken() {
        return "Bearer " + Jwts.builder().subject("admin-ui").claim("roles", List.of("ROLE_ADMIN"))
                .expiration(Date.from(Instant.now().plusSeconds(300)))
                .signWith(Keys.hmacShaKeyFor(Decoders.BASE64.decode(SECRET))).compact();
    }

    @Test
    void thePhotoIsPublicAndServedWithItsRealTypeWithoutBeingCached() throws Exception {
        given(profilePhotoUseCase.current()).willReturn(ProfilePhotoDomain.of(PNG));

        mockMvc.perform(get("/public/profile/photo"))
                .andExpect(status().isOk())
                .andExpect(content().contentType(MediaType.IMAGE_PNG))
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-cache"))
                .andExpect(content().bytes(PNG));
    }

    @Test
    void withoutPhotoThePublicEndpointAnswers404() throws Exception {
        given(profilePhotoUseCase.current()).willThrow(new ResourceNotFoundException("ProfilePhoto", "current"));

        mockMvc.perform(get("/public/profile/photo"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("RESOURCE_NOT_FOUND"));
    }

    @Test
    void onlyAnAdminCanUploadOrRemoveThePhoto() throws Exception {
        mockMvc.perform(multipart(HttpMethod.PUT, "/admin/profile/photo").file(FILE)).andExpect(status().isUnauthorized());
        mockMvc.perform(delete("/admin/profile/photo")).andExpect(status().isUnauthorized());
        verifyNoInteractions(profilePhotoUseCase);

        mockMvc.perform(multipart(HttpMethod.PUT, "/admin/profile/photo").file(FILE).header(HttpHeaders.AUTHORIZATION, adminToken()))
                .andExpect(status().isNoContent());
        verify(profilePhotoUseCase).upload(PNG);

        mockMvc.perform(delete("/admin/profile/photo").header(HttpHeaders.AUTHORIZATION, adminToken())).andExpect(status().isNoContent());
        verify(profilePhotoUseCase).remove();
    }

    @Test
    void aFileThatIsNotAnImageIsRejectedWithAProblemDetail() throws Exception {
        willThrow(new InvalidRequestException("La foto debe ser una imagen JPEG o PNG")).given(profilePhotoUseCase).upload(PNG);

        mockMvc.perform(multipart(HttpMethod.PUT, "/admin/profile/photo").file(FILE).header(HttpHeaders.AUTHORIZATION, adminToken()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.detail").value("La foto debe ser una imagen JPEG o PNG"));
    }
}
