package dev.portfolio.application.service;

import dev.portfolio.application.port.in.CareerUseCase;
import dev.portfolio.application.port.out.CareerStoryPort;
import dev.portfolio.domain.model.CareerMilestoneDomain;

import java.util.List;

public class CareerService implements CareerUseCase {

    private final CareerStoryPort careerStory;

    public CareerService(CareerStoryPort careerStory) {
        this.careerStory = careerStory;
    }

    @Override
    public List<CareerMilestoneDomain> timeline() {
        return careerStory.loadMilestones();
    }
}
