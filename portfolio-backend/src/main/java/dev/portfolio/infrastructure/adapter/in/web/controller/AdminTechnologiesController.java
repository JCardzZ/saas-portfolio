package dev.portfolio.infrastructure.adapter.in.web.controller;

import dev.portfolio.api.AdminTechnologiesCmsApi;
import dev.portfolio.application.port.in.TechnologyUseCase;
import dev.portfolio.infrastructure.adapter.in.web.mapper.TechnologyWebMapper;
import dev.portfolio.model.Technology;
import dev.portfolio.model.TechnologyRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequiredArgsConstructor
public class AdminTechnologiesController implements AdminTechnologiesCmsApi {

    private final TechnologyUseCase technologyUseCase;
    private final TechnologyWebMapper mapper;

    @Override
    public ResponseEntity<List<Technology>> adminTechnologiesGet() {
        return ResponseEntity.ok(mapper.toDto(technologyUseCase.findAll()));
    }

    @Override
    public ResponseEntity<Technology> adminTechnologiesPost(TechnologyRequest technologyRequest) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(mapper.toDto(technologyUseCase.create(mapper.toDomain(technologyRequest))));
    }

    @Override
    public ResponseEntity<Void> adminTechnologiesIdPut(String id, TechnologyRequest technologyRequest) {
        technologyUseCase.update(id, mapper.toDomain(technologyRequest));
        return ResponseEntity.ok().build();
    }

    @Override
    public ResponseEntity<Void> adminTechnologiesIdDelete(String id) {
        technologyUseCase.delete(id);
        return ResponseEntity.noContent().build();
    }
}
