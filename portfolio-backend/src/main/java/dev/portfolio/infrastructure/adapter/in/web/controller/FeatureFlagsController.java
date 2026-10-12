package dev.portfolio.infrastructure.adapter.in.web.controller;

import dev.portfolio.api.FeatureFlagsApi;
import dev.portfolio.application.port.in.FeatureFlagUseCase;
import dev.portfolio.infrastructure.adapter.in.web.mapper.FeatureFlagWebMapper;
import dev.portfolio.model.FeatureFlag;
import dev.portfolio.model.FeatureFlagAuditEntry;
import dev.portfolio.model.FeatureFlagDetail;
import dev.portfolio.model.FeatureFlagUpdate;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequiredArgsConstructor
public class FeatureFlagsController implements FeatureFlagsApi {

    private final FeatureFlagUseCase flags;
    private final FeatureFlagWebMapper mapper;

    @Override
    public ResponseEntity<List<FeatureFlag>> publicFeaturesGet() {
        return ResponseEntity.ok(mapper.toDto(flags.enabled()));
    }

    @Override
    public ResponseEntity<List<FeatureFlagDetail>> adminFeaturesGet() {
        return ResponseEntity.ok(mapper.toDetails(flags.findAll()));
    }

    @Override
    public ResponseEntity<List<FeatureFlagAuditEntry>> adminFeaturesAuditGet() {
        return ResponseEntity.ok(mapper.toAudit(flags.audit()));
    }

    @Override
    public ResponseEntity<FeatureFlagDetail> adminFeaturesKeyPut(String key, FeatureFlagUpdate featureFlagUpdate) {
        // El actor sale del token ya verificado, nunca del cuerpo de la petición.
        String actor = SecurityContextHolder.getContext().getAuthentication().getName();
        return ResponseEntity.ok(mapper.toDetail(flags.set(key, featureFlagUpdate.getEnabled(), actor)));
    }
}
