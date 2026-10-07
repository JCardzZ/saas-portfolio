package dev.portfolio.application.service;

import dev.portfolio.application.port.out.CareerStoryPort;
import dev.portfolio.application.port.out.CvRendererPort;
import dev.portfolio.application.port.out.CvRendererPort.Portrait;
import dev.portfolio.application.port.out.ProfilePhotoPort;
import dev.portfolio.domain.model.ProfilePhotoDomain;
import dev.portfolio.domain.exception.ResourceNotFoundException;
import dev.portfolio.domain.model.CvContentDomain;
import dev.portfolio.domain.model.CvContentDomain.Block;
import dev.portfolio.domain.model.CvContentDomain.Kind;
import dev.portfolio.domain.model.CvDocumentDomain;
import dev.portfolio.domain.model.CvLanguage;
import dev.portfolio.domain.model.CvType;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

class CvServiceTest {

    private static final String STORY = """
            # Ana Núñez López — Ingeniera de Software

            <!-- nota para quien edita,
            en dos líneas -->

            # Perfil

            Primer párrafo del perfil.

            Segundo párrafo del perfil.

            # Experiencia

            <!-- timeline:start -->

            ## 2023 - 2025 — Plataforma de pagos

            - **Rol:** Staff Engineer
            - **Organización:** Acme
            - **Tecnologías:** Java 21, Kotlin

            Rediseñé el núcleo de pagos. Bajó la latencia.

            Otro párrafo de detalle.

            <!-- timeline:end -->

            # Competencias

            <!-- cv:sidebar -->

            - Uno
            - Dos, que sigue
              en la línea siguiente
            - Tres
            - Cuatro
            - Cinco
            """;

    private final CareerStoryPort careerStory = mock(CareerStoryPort.class);
    private final CvRendererPort renderer = mock(CvRendererPort.class);
    private final ProfilePhotoPort photos = mock(ProfilePhotoPort.class);
    private final CvService service = new CvService(careerStory, renderer, photos);

    @BeforeEach
    void setUp() {
        given(careerStory.loadStory(CvLanguage.ES)).willReturn(Optional.of(STORY));
        given(photos.load()).willReturn(Optional.empty());
        given(renderer.render(any(), any(), any(), any())).willReturn(new byte[] {37, 80, 68, 70});
    }

    @Test
    void readsNameHeadlineAndSectionsFromTheStoryLeavingEditorNotesOut() {
        CvContentDomain content = CvMarkdownParser.parse(STORY);

        assertThat(content.name()).isEqualTo("Ana Núñez López");
        assertThat(content.headline()).isEqualTo("Ingeniera de Software");
        assertThat(content.sections()).extracting(CvContentDomain.Section::title)
                .containsExactly("Perfil", "Experiencia", "Competencias");
        assertThat(content.sections().get(1).blocks()).containsExactly(
                new Block(Kind.HEADING, "2023 - 2025 — Plataforma de pagos"),
                new Block(Kind.BULLET, "**Rol:** Staff Engineer"),
                new Block(Kind.BULLET, "**Organización:** Acme"),
                new Block(Kind.BULLET, "**Tecnologías:** Java 21, Kotlin"),
                new Block(Kind.PARAGRAPH, "Rediseñé el núcleo de pagos. Bajó la latencia."),
                new Block(Kind.PARAGRAPH, "Otro párrafo de detalle."));
        // Una viñeta partida en dos líneas es una sola.
        assertThat(content.sections().get(2).blocks()).hasSize(5)
                .contains(new Block(Kind.BULLET, "Dos, que sigue en la línea siguiente"));
        assertThat(content.toString()).doesNotContain("nota para quien edita").doesNotContain("timeline").doesNotContain("cv:sidebar");
        // Solo la sección marcada es un dato de apoyo, y el resumen de una página lo conserva.
        assertThat(content.sections()).extracting(CvContentDomain.Section::aside).containsExactly(false, false, true);
        assertThat(CvService.summarise(content).sections()).extracting(CvContentDomain.Section::aside).containsExactly(false, false, true);
    }

    @Test
    void fullAndAtsCarryTheWholeStoryAndTheFileIsNamedAfterThePerson() {
        CvDocumentDomain cv = service.download(CvLanguage.ES, CvType.ATS, true);

        assertThat(cv.filename()).isEqualTo("cv-ana-nunez-lopez-es-ats.pdf");
        assertThat(cv.content()).startsWith(37, 80, 68, 70);
        ArgumentCaptor<CvContentDomain> content = ArgumentCaptor.forClass(CvContentDomain.class);
        // La variante ATS nunca lleva foto, aunque se pida.
        verify(renderer).render(content.capture(), eq(CvType.ATS), eq(CvLanguage.ES), eq(Portrait.NONE));
        assertThat(content.getValue()).isEqualTo(CvMarkdownParser.parse(STORY));
    }

    @Test
    void shortKeepsTheFactsAndTheFirstSentenceOfEachEntry() {
        service.download(CvLanguage.ES, CvType.SHORT, false);

        ArgumentCaptor<CvContentDomain> content = ArgumentCaptor.forClass(CvContentDomain.class);
        verify(renderer).render(content.capture(), eq(CvType.SHORT), eq(CvLanguage.ES), eq(Portrait.NONE));
        assertThat(content.getValue().sections().get(0).blocks()).containsExactly(new Block(Kind.PARAGRAPH, "Primer párrafo del perfil."));
        assertThat(content.getValue().sections().get(1).blocks()).containsExactly(
                new Block(Kind.HEADING, "2023 - 2025 — Plataforma de pagos"),
                new Block(Kind.BULLET, "**Rol:** Staff Engineer"),
                new Block(Kind.BULLET, "**Organización:** Acme"),
                new Block(Kind.BULLET, "**Tecnologías:** Java 21, Kotlin"),
                new Block(Kind.PARAGRAPH, "Rediseñé el núcleo de pagos."));
        assertThat(content.getValue().sections().get(2).blocks()).hasSize(4);
    }

    @Test
    void rendersEachVariantOnceAndAgainOnlyWhenTheStoryChanges() {
        service.download(CvLanguage.ES, CvType.FULL, true);
        service.download(CvLanguage.ES, CvType.FULL, true);
        verify(renderer, times(1)).render(any(), eq(CvType.FULL), any(), any());

        given(careerStory.loadStory(CvLanguage.ES)).willReturn(Optional.of(STORY.replace("Acme", "Globex")));
        service.download(CvLanguage.ES, CvType.FULL, true);
        verify(renderer, times(2)).render(any(), eq(CvType.FULL), any(), any());
    }

    @Test
    void theDesignedCvCarriesThePhotoOrTheAvatarAndFollowsThePhotoAsItChanges() {
        ProfilePhotoDomain photo = ProfilePhotoDomain.of(new byte[] {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, 1});

        // Sin foto subida: marco con el avatar de iniciales.
        service.download(CvLanguage.ES, CvType.FULL, true);
        verify(renderer).render(any(), eq(CvType.FULL), eq(CvLanguage.ES), eq(new Portrait(true, Optional.empty())));

        // Al subir una foto, la siguiente descarga ya la lleva, sin esperar a nada más.
        given(photos.load()).willReturn(Optional.of(photo));
        service.download(CvLanguage.ES, CvType.FULL, true);
        service.download(CvLanguage.ES, CvType.FULL, true);
        verify(renderer, times(1)).render(any(), eq(CvType.FULL), eq(CvLanguage.ES), eq(new Portrait(true, Optional.of(photo))));

        // Sin foto es otro documento, que no se ve afectado por la foto.
        service.download(CvLanguage.ES, CvType.FULL, false);
        service.download(CvLanguage.ES, CvType.FULL, false);
        verify(renderer, times(1)).render(any(), eq(CvType.FULL), eq(CvLanguage.ES), eq(Portrait.NONE));
        service.download(CvLanguage.ES, CvType.FULL, true);
        verify(renderer, times(3)).render(any(), any(), any(), any());
    }

    @Test
    void aLanguageWithoutStoryIsNotFound() {
        given(careerStory.loadStory(CvLanguage.EN)).willReturn(Optional.empty());

        assertThatThrownBy(() -> service.download(CvLanguage.EN, CvType.FULL, true)).isInstanceOf(ResourceNotFoundException.class);
        verifyNoInteractions(renderer);
    }
}
