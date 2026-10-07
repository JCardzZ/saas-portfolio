package dev.portfolio.infrastructure.adapter.in.web.mapper;

import dev.portfolio.application.port.in.ArchitectureProjectUseCase.Draft;
import dev.portfolio.domain.model.ArchitectureProjectDomain;
import dev.portfolio.domain.model.CloudCatalogItemDomain;
import dev.portfolio.domain.model.CloudProviderDomain;
import dev.portfolio.domain.model.TerraformBundleDomain;
import dev.portfolio.model.ArchitectureProject;
import dev.portfolio.model.ArchitectureProjectRequest;
import dev.portfolio.model.ArchitectureProjectSummary;
import dev.portfolio.model.CloudCatalogItem;
import dev.portfolio.model.TerraformBundle;
import org.springframework.stereotype.Component;

import java.time.ZoneOffset;
import java.util.List;

/** A mano y no con MapStruct: los enumerados de nube se generan uno por esquema y el grafo es JSON libre. */
@Component
public class ArchitectureWebMapper {

    public List<ArchitectureProjectSummary> toSummaries(List<ArchitectureProjectDomain> projects) {
        return projects.stream().map(project -> new ArchitectureProjectSummary()
                .id(project.id())
                .title(project.title())
                .description(project.description())
                .cloudProvider(ArchitectureProjectSummary.CloudProviderEnum.fromValue(project.cloudProvider().code()))
                .isPreset(project.preset())
                .createdAt(project.createdAt().atOffset(ZoneOffset.UTC))).toList();
    }

    public ArchitectureProject toDto(ArchitectureProjectDomain project) {
        ArchitectureProject dto = new ArchitectureProject();
        dto.setId(project.id());
        dto.setTitle(project.title());
        dto.setDescription(project.description());
        dto.setCloudProvider(ArchitectureProject.CloudProviderEnum.fromValue(project.cloudProvider().code()));
        dto.setIsPreset(project.preset());
        dto.setCreatedAt(project.createdAt().atOffset(ZoneOffset.UTC));
        dto.setNodes(project.nodes());
        dto.setConnections(project.connections());
        dto.setZones(project.zones());
        return dto;
    }

    public Draft toDraft(ArchitectureProjectRequest request) {
        return new Draft(request.getTitle(), request.getDescription(),
                request.getCloudProvider() == null ? null : CloudProviderDomain.fromCode(request.getCloudProvider().getValue()),
                request.getNodes(), request.getConnections(), request.getZones());
    }

    public List<CloudCatalogItem> toCatalog(List<CloudCatalogItemDomain> items) {
        return items.stream().map(item -> new CloudCatalogItem()
                .id(item.id())
                .provider(CloudCatalogItem.ProviderEnum.fromValue(item.provider().code()))
                .code(item.code())
                .name(item.name())
                .category(item.category())
                .defaultMonthlyCost(item.defaultMonthlyCost())
                .isEnterprise(item.enterprise())).toList();
    }

    public TerraformBundle toDto(TerraformBundleDomain bundle) {
        return new TerraformBundle().mainTf(bundle.mainTf()).variablesTf(bundle.variablesTf());
    }
}
