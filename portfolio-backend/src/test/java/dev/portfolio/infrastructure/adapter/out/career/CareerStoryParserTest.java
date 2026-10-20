package dev.portfolio.infrastructure.adapter.out.career;

import dev.portfolio.domain.model.CareerMilestoneDomain;
import dev.portfolio.domain.model.CvLanguage;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class CareerStoryParserTest {

    private static final String STORY = """
            # Trayectoria

            ## Cómo rellenarlo — instrucciones que no son un hito

            <!-- timeline:start -->

            ## 2023 - 2025 — Plataforma de pagos

            - **Rol:** Staff Engineer
            - **Organización:** Acme Corp
            - **Tecnologías:** Java 21, Spring Boot 3 , PostgreSQL

            Rediseñé el núcleo transaccional.
            Redujo los incidentes a la mitad.

            ### Detalle que no pertenece al resumen

            Texto solo para RAG.

            ## 2020 - 2023 - Migración a la nube

            Sin metadatos, solo resumen.

            ## [COMPLETAR: periodo] — [COMPLETAR: título]

            - **Rol:** [COMPLETAR]

            [COMPLETAR: resumen]

            ## 2019 — Hito a medias

            - **Rol:** Backend
            - **Organización:** [COMPLETAR]

            Resumen ya escrito.

            <!-- timeline:end -->

            ## 2010 — Fuera de la línea de tiempo

            No debe aparecer.
            """;

    @Test
    void readsMilestonesBetweenTheMarkersInDocumentOrder() {
        List<CareerMilestoneDomain> milestones = CareerStoryParser.parse(STORY);

        assertThat(milestones).extracting(CareerMilestoneDomain::title)
                .containsExactly("Plataforma de pagos", "Migración a la nube");

        CareerMilestoneDomain first = milestones.get(0);
        assertThat(first.period()).isEqualTo("2023 - 2025");
        assertThat(first.role()).isEqualTo("Staff Engineer");
        assertThat(first.organization()).isEqualTo("Acme Corp");
        assertThat(first.technologies()).containsExactly("Java 21", "Spring Boot 3", "PostgreSQL");
        assertThat(first.summary()).isEqualTo("Rediseñé el núcleo transaccional. Redujo los incidentes a la mitad.");
    }

    @Test
    void acceptsAPlainHyphenAsSeparatorAndMilestonesWithoutMetadata() {
        CareerMilestoneDomain second = CareerStoryParser.parse(STORY).get(1);

        assertThat(second.period()).isEqualTo("2020 - 2023");
        assertThat(second.role()).isNull();
        assertThat(second.technologies()).isEmpty();
        assertThat(second.summary()).isEqualTo("Sin metadatos, solo resumen.");
    }

    @Test
    void neverPublishesMilestonesThatStillHavePlaceholders() {
        assertThat(CareerStoryParser.parse(STORY)).extracting(CareerMilestoneDomain::title)
                .doesNotContain("Hito a medias")
                .noneMatch(title -> title.contains("COMPLETAR"));
    }

    @Test
    void returnsNothingWithoutMarkers() {
        assertThat(CareerStoryParser.parse("## 2024 — Hito\n\nResumen.")).isEmpty();
    }

    @Test
    void theShippedStoryPublishesItsMilestonesNewestFirst() throws IOException {
        Path story = Path.of("../docs/career/CAREER_STORY.md");

        assertThat(story).exists();
        List<CareerMilestoneDomain> milestones = CareerStoryParser.parse(Files.readString(story));
        assertThat(milestones).extracting(CareerMilestoneDomain::period)
                .containsExactly("2024 - actualidad", "2023", "2022", "2020", "2019");
        assertThat(milestones).extracting(CareerMilestoneDomain::organization)
                .containsExactly("PBS Consulting (proyecto para el BCR)", "Universidad Dr. Andrés Bello, Chalatenango",
                        "Banco Agrícola", "Banco Davivienda", "Tribunal Supremo Electoral");
        assertThat(milestones.get(2).role()).isEqualTo("Desarrollador Java Broker");
        assertThat(milestones.get(2).technologies()).contains("IBM AS400", "IBM MQ Series", "Spring Batch");
        // Nada a medio rellenar ni datos de contacto en un documento que es público.
        assertThat(Files.readString(story)).doesNotContain("[COMPLETAR").doesNotContain("@");
    }

    @Test
    void theEnglishTranslationPublishesTheSameMilestonesInEnglish() {
        MarkdownCareerStoryAdapter adapter = new MarkdownCareerStoryAdapter(new CareerProperties("../docs/career/CAREER_STORY.md"));

        List<CareerMilestoneDomain> spanish = adapter.loadMilestones(CvLanguage.ES);
        List<CareerMilestoneDomain> english = adapter.loadMilestones(CvLanguage.EN);
        // Mismos hitos, en el mismo orden: la traducción se mantiene a mano y este test lo vigila.
        assertThat(english).hasSameSizeAs(spanish);
        assertThat(english).extracting(CareerMilestoneDomain::period)
                .containsExactly("2024 - present", "2023", "2022", "2020", "2019");
        assertThat(english.get(0).role()).isEqualTo("Backend Developer");
        assertThat(english.get(0).organization()).isEqualTo("PBS Consulting (project for BCR)");
        for (int i = 0; i < english.size(); i++) {
            assertThat(english.get(i).technologies()).as("tecnologías del hito %d", i).isEqualTo(spanish.get(i).technologies());
            assertThat(english.get(i).summary()).as("resumen del hito %d", i).isNotBlank().isNotEqualTo(spanish.get(i).summary());
        }
    }

    @Test
    void adapterOffersTheWholeDocumentForRagUnlessItIsStillMarkedAsTemplate(@TempDir Path directory) throws IOException {
        Path story = directory.resolve("CAREER_STORY.md");
        Files.writeString(story, STORY);
        MarkdownCareerStoryAdapter adapter = new MarkdownCareerStoryAdapter(new CareerProperties(story.toString()));

        assertThat(adapter.loadDocument()).hasValueSatisfying(document -> {
            assertThat(document.sourceId()).isEqualTo("docs/career/CAREER_STORY.md");
            // Entero: también lo que queda fuera de la línea de tiempo, que es contexto para el asistente.
            assertThat(document.content()).contains("Plataforma de pagos").contains("Fuera de la línea de tiempo");
        });

        Files.writeString(story, "<!-- rag:skip -->\n" + STORY);
        assertThat(adapter.loadDocument()).isEmpty();
        // El marcador solo afecta al asistente: la línea de tiempo se sigue publicando.
        assertThat(adapter.loadMilestones()).hasSize(2);

        assertThat(new MarkdownCareerStoryAdapter(new CareerProperties("../docs/career/CAREER_STORY.md")).loadDocument())
                .as("la trayectoria real se ofrece entera al asistente")
                .hasValueSatisfying(document -> assertThat(document.content()).contains("Banco Davivienda", "# Perfil"));
    }

    @Test
    void adapterReadsTheConfiguredFileAndToleratesItsAbsence(@TempDir Path directory) throws IOException {
        Path story = directory.resolve("CAREER_STORY.md");
        Files.writeString(story, STORY);

        assertThat(new MarkdownCareerStoryAdapter(new CareerProperties(story.toString())).loadMilestones()).hasSize(2);
        assertThat(new MarkdownCareerStoryAdapter(new CareerProperties(directory.resolve("no.md").toString())).loadMilestones()).isEmpty();
        assertThat(new MarkdownCareerStoryAdapter(new CareerProperties("")).loadMilestones()).isEmpty();
    }
}
