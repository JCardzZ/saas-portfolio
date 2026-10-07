package dev.portfolio.infrastructure.adapter.in.web.controller;

import dev.portfolio.api.AdminProjectsCmsApi;
import dev.portfolio.application.port.in.ProjectUseCase;
import dev.portfolio.infrastructure.adapter.in.web.mapper.ProjectWebMapper;
import dev.portfolio.model.Project;
import dev.portfolio.model.ProjectRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequiredArgsConstructor
public class AdminProjectsController implements AdminProjectsCmsApi {

    private final ProjectUseCase projectUseCase;
    private final ProjectWebMapper mapper;

    @Override
    public ResponseEntity<List<Project>> adminProjectsGet() {
        return ResponseEntity.ok(mapper.toDto(projectUseCase.findAll()));
    }

    @Override
    public ResponseEntity<Project> adminProjectsPost(ProjectRequest projectRequest) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(mapper.toDto(projectUseCase.create(mapper.toDomain(projectRequest))));
    }

    @Override
    public ResponseEntity<Void> adminProjectsIdPut(String id, ProjectRequest projectRequest) {
        projectUseCase.update(id, mapper.toDomain(projectRequest));
        return ResponseEntity.ok().build();
    }

    @Override
    public ResponseEntity<Void> adminProjectsIdDelete(String id) {
        projectUseCase.delete(id);
        return ResponseEntity.noContent().build();
    }
}
