package dev.portfolio.infrastructure.adapter.in.web.controller;

import dev.portfolio.model.PricingResponse;
import dev.portfolio.model.PricingRequest;
import dev.portfolio.application.port.in.PricingUseCase;
import dev.portfolio.api.ArchitectureStudioApi;
import dev.portfolio.application.port.in.ArchitectureProjectUseCase;
import dev.portfolio.application.port.in.CloudCatalogUseCase;
import dev.portfolio.application.port.in.TerraformUseCase;
import dev.portfolio.domain.model.CloudProviderDomain;
import dev.portfolio.infrastructure.adapter.in.web.mapper.ArchitectureWebMapper;
import dev.portfolio.model.ArchitectureProject;
import dev.portfolio.model.ArchitectureProjectRequest;
import dev.portfolio.model.ArchitectureProjectSummary;
import dev.portfolio.model.ArchitectureTopology;
import dev.portfolio.model.CloudCatalogItem;
import dev.portfolio.model.TerraformBundle;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Optional;

@RestController
@RequiredArgsConstructor
public class ArchitectureStudioController implements ArchitectureStudioApi {

    private final ArchitectureProjectUseCase projects;
    private final TerraformUseCase terraform;
    private final CloudCatalogUseCase catalog;
    private final PricingUseCase pricing;
    private final ArchitectureWebMapper mapper;
    private final HttpServletRequest request;

    @Override
    public ResponseEntity<List<ArchitectureProjectSummary>> publicArchitectureProjectsGet() {
        return ResponseEntity.ok(mapper.toSummaries(projects.findAll()));
    }

    @Override
    public ResponseEntity<ArchitectureProject> publicArchitectureProjectsIdGet(String id) {
        return ResponseEntity.ok(mapper.toDto(projects.findById(id)));
    }

    @Override
    public ResponseEntity<ArchitectureProject> adminArchitectureProjectsPost(ArchitectureProjectRequest architectureProjectRequest) {
        return ResponseEntity.status(HttpStatus.CREATED).body(mapper.toDto(projects.create(mapper.toDraft(architectureProjectRequest))));
    }

    @Override
    public ResponseEntity<ArchitectureProject> adminArchitectureProjectsIdPut(String id, ArchitectureProjectRequest architectureProjectRequest) {
        return ResponseEntity.ok(mapper.toDto(projects.update(id, mapper.toDraft(architectureProjectRequest))));
    }

    @Override
    public ResponseEntity<List<CloudCatalogItem>> publicArchitectureCatalogGet(String provider) {
        return ResponseEntity.ok(mapper.toCatalog(catalog.find(Optional.ofNullable(provider).map(CloudProviderDomain::fromCode))));
    }

    @Override
    public ResponseEntity<TerraformBundle> publicArchitectureGenerateTerraformPost(ArchitectureTopology architectureTopology) {
        return ResponseEntity.ok(mapper.toDto(terraform.generate(
                CloudProviderDomain.fromCode(architectureTopology.getCloudProvider().getValue()),
                architectureTopology.getNodes(), architectureTopology.getConnections(), request.getRemoteAddr())));
    }

    @Override
    public ResponseEntity<PricingResponse> publicArchitecturePricingPost(PricingRequest pricingRequest) {
        CloudProviderDomain provider = CloudProviderDomain.fromCode(pricingRequest.getCloudProvider().getValue());
        return ResponseEntity.ok(mapper.toDto(provider, pricing.quote(provider, pricingRequest.getServices(), request.getRemoteAddr())));
    }
}
