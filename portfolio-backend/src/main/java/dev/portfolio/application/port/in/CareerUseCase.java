package dev.portfolio.application.port.in;

import dev.portfolio.domain.model.CareerMilestoneDomain;
import dev.portfolio.domain.model.CvLanguage;

import java.util.List;

public interface CareerUseCase {

    /**
     * @return los hitos publicados en ese idioma, del más reciente al más antiguo; si la traducción
     *         no tiene hitos, los del original en español
     */
    List<CareerMilestoneDomain> timeline(CvLanguage language);
}
