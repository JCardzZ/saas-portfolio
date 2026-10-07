package dev.portfolio.application.port.in;

import dev.portfolio.domain.model.CareerMilestoneDomain;

import java.util.List;

public interface CareerUseCase {

    /** @return los hitos publicados, del más reciente al más antiguo */
    List<CareerMilestoneDomain> timeline();
}
