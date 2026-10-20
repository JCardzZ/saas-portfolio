package dev.portfolio.infrastructure.adapter.in.web.controller;

import dev.portfolio.api.PublicCatalogShowcasesApi;
import dev.portfolio.application.port.in.ArticleUseCase;
import dev.portfolio.application.port.in.CareerUseCase;
import dev.portfolio.application.port.in.CvUseCase;
import dev.portfolio.domain.model.CvDocumentDomain;
import dev.portfolio.domain.model.CvLanguage;
import dev.portfolio.domain.model.CvType;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import dev.portfolio.application.port.in.ProjectUseCase;
import dev.portfolio.application.port.in.TechnologyUseCase;
import dev.portfolio.infrastructure.adapter.in.web.mapper.ArticleWebMapper;
import dev.portfolio.infrastructure.adapter.in.web.mapper.CareerWebMapper;
import dev.portfolio.infrastructure.adapter.in.web.mapper.ProjectWebMapper;
import dev.portfolio.infrastructure.adapter.in.web.mapper.TechnologyWebMapper;
import dev.portfolio.model.ArchitectureDiagram;
import dev.portfolio.model.Article;
import dev.portfolio.model.CareerMilestone;
import dev.portfolio.model.Project;
import dev.portfolio.model.Technology;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequiredArgsConstructor
public class PublicCatalogController implements PublicCatalogShowcasesApi {

    private final TechnologyUseCase technologyUseCase;
    private final ProjectUseCase projectUseCase;
    private final TechnologyWebMapper technologyMapper;
    private final ProjectWebMapper projectMapper;
    private final CareerUseCase careerUseCase;
    private final CareerWebMapper careerMapper;
    private final CvUseCase cvUseCase;
    private final ArticleUseCase articleUseCase;
    private final ArticleWebMapper articleMapper;

    @Override
    public ResponseEntity<List<Technology>> publicTechnologiesGet() {
        return ResponseEntity.ok(technologyMapper.toDto(technologyUseCase.findAll()));
    }

    @Override
    public ResponseEntity<List<Project>> publicProjectsGet() {
        return ResponseEntity.ok(projectMapper.toDto(projectUseCase.findAll()));
    }

    @Override
    public ResponseEntity<List<CareerMilestone>> publicCareerTimelineGet(String lang) {
        return ResponseEntity.ok(careerMapper.toDto(careerUseCase.timeline(CvLanguage.fromCode(lang == null ? "es" : lang))));
    }

    @Override
    public ResponseEntity<Resource> publicCvDownloadGet(String lang, String type, Boolean photo) {
        CvDocumentDomain cv = cvUseCase.download(CvLanguage.fromCode(lang), CvType.fromCode(type), !Boolean.FALSE.equals(photo));
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_PDF)
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename(cv.filename()).build().toString())
                .body(new ByteArrayResource(cv.content()));
    }

    @Override
    public ResponseEntity<List<Article>> publicArticlesGet() {
        return ResponseEntity.ok(articleMapper.toDto(articleUseCase.findAll()));
    }

    // La interfaz generada obliga a declararlo; los diagramas C4 aún no tienen caso de uso.
    @Override
    public ResponseEntity<ArchitectureDiagram> publicArchitectureC4LevelGet(String level) {
        return ResponseEntity.status(HttpStatus.NOT_IMPLEMENTED).build();
    }
}
