package dev.portfolio.application.service;

import dev.portfolio.application.port.out.CareerStoryPort;
import dev.portfolio.domain.model.CareerMilestoneDomain;
import dev.portfolio.domain.model.CvLanguage;
import dev.portfolio.domain.model.SourceDocumentDomain;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

class CareerServiceTest {

    private static final CareerMilestoneDomain SPANISH = new CareerMilestoneDomain("2023", "Hito", "Rol", "Org", List.of("Java"), "Resumen.");
    private static final CareerMilestoneDomain ENGLISH = new CareerMilestoneDomain("2023", "Milestone", "Role", "Org", List.of("Java"), "Summary.");

    private static CareerStoryPort story(Map<CvLanguage, List<CareerMilestoneDomain>> byLanguage) {
        return new CareerStoryPort() {
            @Override
            public List<CareerMilestoneDomain> loadMilestones(CvLanguage language) {
                return byLanguage.getOrDefault(language, List.of());
            }

            @Override
            public Optional<SourceDocumentDomain> loadDocument() {
                return Optional.empty();
            }

            @Override
            public Optional<String> loadStory(CvLanguage language) {
                return Optional.empty();
            }
        };
    }

    @Test
    void servesTheTimelineInTheLanguageAskedFor() {
        CareerService service = new CareerService(story(Map.of(CvLanguage.ES, List.of(SPANISH), CvLanguage.EN, List.of(ENGLISH))));

        assertThat(service.timeline(CvLanguage.EN)).containsExactly(ENGLISH);
        assertThat(service.timeline(CvLanguage.ES)).containsExactly(SPANISH);
    }

    @Test
    void fallsBackToTheSpanishOriginalWhenTheTranslationHasNoMilestones() {
        CareerService service = new CareerService(story(Map.of(CvLanguage.ES, List.of(SPANISH))));

        assertThat(service.timeline(CvLanguage.EN)).containsExactly(SPANISH);
    }
}
