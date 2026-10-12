package dev.portfolio.infrastructure.adapter.in.web.controller;

import dev.portfolio.api.SystemDesignApi;
import dev.portfolio.application.port.in.FeatureFlagUseCase;
import dev.portfolio.application.port.in.SystemDesignUseCase;
import dev.portfolio.infrastructure.adapter.in.web.flags.CloudProviders;
import dev.portfolio.infrastructure.adapter.in.web.mapper.SystemDesignWebMapper;
import dev.portfolio.model.SystemDesignBundle;
import dev.portfolio.model.SystemDesignCatalog;
import dev.portfolio.model.SystemDesignEvaluation;
import dev.portfolio.model.SystemDesignRequest;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

/** Diseño de sistemas. Todas sus rutas están detrás de la flag {@code studio.system-design} (FeatureGateConfig). */
@RestController
@RequiredArgsConstructor
public class SystemDesignController implements SystemDesignApi {

    private final SystemDesignUseCase systemDesign;
    private final SystemDesignWebMapper mapper;
    private final HttpServletRequest request;
    private final ObjectProvider<FeatureFlagUseCase> flags;

    @Override
    public ResponseEntity<SystemDesignCatalog> publicArchitectureSystemDesignCatalogGet() {
        return ResponseEntity.ok(mapper.toDto(systemDesign.catalog()));
    }

    @Override
    public ResponseEntity<SystemDesignEvaluation> publicArchitectureSystemDesignEvaluatePost(SystemDesignRequest systemDesignRequest) {
        return ResponseEntity.ok(new SystemDesignEvaluation()
                .findings(mapper.toFindings(systemDesign.evaluate(toDomain(systemDesignRequest), request.getRemoteAddr()))));
    }

    @Override
    public ResponseEntity<SystemDesignBundle> publicArchitectureSystemDesignGeneratePost(SystemDesignRequest systemDesignRequest) {
        return ResponseEntity.ok(mapper.toDto(systemDesign.generate(toDomain(systemDesignRequest), request.getRemoteAddr())));
    }

    private SystemDesignUseCase.Request toDomain(SystemDesignRequest body) {
        return new SystemDesignUseCase.Request(CloudProviders.resolve(body.getCloudProvider(), flags), body.getNodes(), body.getConnections(),
                mapper.toDomain(body.getSystem()),
                body.getEstimatedMonthlyCostUsd() == null ? null : body.getEstimatedMonthlyCostUsd().doubleValue());
    }
}
