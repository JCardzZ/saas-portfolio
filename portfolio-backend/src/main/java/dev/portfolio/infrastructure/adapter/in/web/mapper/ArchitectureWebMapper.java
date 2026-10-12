package dev.portfolio.infrastructure.adapter.in.web.mapper;

import java.math.RoundingMode;
import dev.portfolio.model.PricingResponse;
import dev.portfolio.domain.model.pricing.PriceQuote;
import dev.portfolio.domain.model.pricing.Currency;
import dev.portfolio.application.port.in.ArchitectureProjectUseCase.Draft;
import dev.portfolio.application.port.in.FeatureFlagUseCase;
import dev.portfolio.infrastructure.adapter.in.web.flags.CloudProviders;
import org.springframework.beans.factory.ObjectProvider;
import dev.portfolio.domain.model.ArchitectureProjectDomain;
import dev.portfolio.domain.model.CloudCatalogItemDomain;
import dev.portfolio.domain.model.CloudProviderDomain;
import dev.portfolio.domain.model.GraphDiagnosticDomain;
import dev.portfolio.domain.model.TerraformBundleDomain;
import dev.portfolio.model.ArchitectureProject;
import dev.portfolio.model.ArchitectureProjectRequest;
import dev.portfolio.model.ArchitectureProjectSummary;
import dev.portfolio.model.CloudCatalogItem;
import dev.portfolio.model.GraphDiagnostic;
import dev.portfolio.model.TerraformBundle;
import org.springframework.stereotype.Component;

import java.time.ZoneOffset;
import java.util.List;
import java.util.Locale;

/** A mano y no con MapStruct: los enumerados de nube se generan uno por esquema y el grafo es JSON libre. */
@Component
public class ArchitectureWebMapper {

    private final ObjectProvider<FeatureFlagUseCase> flags;
    private final SystemDesignWebMapper systemMapper = new SystemDesignWebMapper();

    public ArchitectureWebMapper(ObjectProvider<FeatureFlagUseCase> flags) {
        this.flags = flags;
    }

    public List<ArchitectureProjectSummary> toSummaries(List<ArchitectureProjectDomain> projects) {
        return projects.stream().map(project -> new ArchitectureProjectSummary()
                .id(project.id())
                .title(project.title())
                .description(project.description())
                .cloudProvider(ArchitectureProjectSummary.CloudProviderEnum.fromValue(project.cloudProvider().code()))
                .isPreset(project.preset())
                .createdAt(project.createdAt().atOffset(ZoneOffset.UTC))).toList();
    }

    /** Sin diagnósticos el campo no viaja: así responde la API mientras la flag esté apagada. */
    public ArchitectureProject toDto(ArchitectureProjectDomain project, List<GraphDiagnosticDomain> diagnostics) {
        ArchitectureProject dto = toDto(project);
        if (!diagnostics.isEmpty()) {
            dto.setDiagnostics(diagnostics.stream().map(diagnostic -> new GraphDiagnostic()
                    .nodeId(diagnostic.nodeId())
                    .rule(GraphDiagnostic.RuleEnum.fromValue(diagnostic.rule()))
                    .severity(GraphDiagnostic.SeverityEnum.fromValue(diagnostic.severity().name().toLowerCase(Locale.ROOT)))
                    .message(diagnostic.message())
                    .suggestion(diagnostic.suggestion())
                    .from(diagnostic.from())
                    .to(diagnostic.to())).toList());
        }
        return dto;
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
        dto.setSystem(systemMapper.toDto(project.system()));
        return dto;
    }

    public Draft toDraft(ArchitectureProjectRequest request) {
        return new Draft(request.getTitle(), request.getDescription(),
                request.getCloudProvider() == null ? null : CloudProviders.resolve(request.getCloudProvider().getValue(), flags),
                request.getNodes(), request.getConnections(), request.getZones(), systemMapper.toDomain(request.getSystem()));
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

    public PricingResponse toDto(CloudProviderDomain provider, List<PriceQuote> quotes) {
        return new PricingResponse()
                .cloudProvider(PricingResponse.CloudProviderEnum.fromValue(provider.code()))
                .currency(Currency.USD.code())
                .quotes(quotes.stream().map(this::toDto).toList());
    }

    /** Sin precio, la cotización solo lleva su código, su estado y el motivo: ningún cero que confundir con un dato. */
    private dev.portfolio.model.PriceQuote toDto(PriceQuote quote) {
        dev.portfolio.model.PriceQuote dto = new dev.portfolio.model.PriceQuote()
                .code(quote.serviceCode())
                .status(dev.portfolio.model.PriceQuote.StatusEnum.fromValue(quote.status().name()))
                .note(quote.note().isEmpty() ? null : quote.note());
        quote.price().ifPresent(pricing -> dto
                .sku(pricing.sku())
                .description(pricing.description())
                .region(pricing.region())
                .unit(dev.portfolio.model.PriceQuote.UnitEnum.fromValue(pricing.unit().name()))
                .unitPrice(pricing.unitPrice().amount().doubleValue())
                .monthlyCost(pricing.monthlyCost().map(monthly -> monthly.amount().setScale(2, RoundingMode.HALF_UP).doubleValue()).orElse(null))
                .currency(pricing.unitPrice().currency().code())
                .source(pricing.source())
                .fetchedAt(pricing.fetchedAt().atOffset(ZoneOffset.UTC)));
        return dto;
    }

    public TerraformBundle toDto(TerraformBundleDomain bundle) {
        return new TerraformBundle().mainTf(bundle.mainTf()).variablesTf(bundle.variablesTf());
    }
}
