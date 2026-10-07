package dev.portfolio.infrastructure.adapter.in.web.mapper;

import dev.portfolio.domain.model.CareerMilestoneDomain;
import dev.portfolio.model.CareerMilestone;
import org.mapstruct.Mapper;
import org.mapstruct.ReportingPolicy;

import java.util.List;

@Mapper(componentModel = "spring", unmappedTargetPolicy = ReportingPolicy.ERROR)
public interface CareerWebMapper {

    CareerMilestone toDto(CareerMilestoneDomain milestone);

    List<CareerMilestone> toDto(List<CareerMilestoneDomain> milestones);
}
