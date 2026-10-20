package dev.portfolio.application.port.out;

import dev.portfolio.domain.model.CareerMilestoneDomain;
import dev.portfolio.domain.model.CvLanguage;
import dev.portfolio.domain.model.SourceDocumentDomain;

import java.util.List;
import java.util.Optional;

public interface CareerStoryPort {

    /** @return los hitos completos de la historia profesional, en el orden del documento; vacío si no hay documento */
    default List<CareerMilestoneDomain> loadMilestones() {
        return loadMilestones(CvLanguage.ES);
    }

    /** @return los hitos de la trayectoria en ese idioma; vacío si no existe ese documento */
    List<CareerMilestoneDomain> loadMilestones(CvLanguage language);

    /**
     * @return el documento completo (hitos, casos de estudio y biografía) para indexarlo en RAG;
     *         vacío si no existe o si su autor lo ha marcado como no indexable todavía
     */
    Optional<SourceDocumentDomain> loadDocument();

    /** @return el texto Markdown de la trayectoria en ese idioma, del que se genera el CV; vacío si no existe */
    Optional<String> loadStory(CvLanguage language);
}
