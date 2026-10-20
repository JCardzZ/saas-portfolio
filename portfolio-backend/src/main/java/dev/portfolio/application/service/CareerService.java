package dev.portfolio.application.service;

import dev.portfolio.application.port.in.CareerUseCase;
import dev.portfolio.application.port.out.CareerStoryPort;
import dev.portfolio.domain.model.CareerMilestoneDomain;
import dev.portfolio.domain.model.CvLanguage;

import java.util.List;

public class CareerService implements CareerUseCase {

    private final CareerStoryPort careerStory;

    public CareerService(CareerStoryPort careerStory) {
        this.careerStory = careerStory;
    }

    @Override
    public List<CareerMilestoneDomain> timeline(CvLanguage language) {
        List<CareerMilestoneDomain> milestones = careerStory.loadMilestones(language);
        // Una traducción que falta o está a medias no deja la trayectoria vacía: se sirve el original.
        return milestones.isEmpty() && language != CvLanguage.ES ? careerStory.loadMilestones(CvLanguage.ES) : milestones;
    }
}
