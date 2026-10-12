package dev.portfolio.infrastructure.adapter.in.web.mapper;

import dev.portfolio.application.port.in.SystemDesignUseCase;
import dev.portfolio.domain.model.system.SystemDesignDomain;
import dev.portfolio.domain.model.system.SystemDesignRules;
import dev.portfolio.domain.model.system.SystemFindingDomain;
import dev.portfolio.model.NonFunctionalRequirements;
import dev.portfolio.model.SystemDesign;
import dev.portfolio.model.SystemDesignBundle;
import dev.portfolio.model.SystemDesignCatalog;
import dev.portfolio.model.SystemDesignCategory;
import dev.portfolio.model.SystemDesignComplianceOption;
import dev.portfolio.model.SystemDesignFile;
import dev.portfolio.model.SystemDesignFinding;
import dev.portfolio.model.SystemDesignOption;
import dev.portfolio.model.SystemDesignRequirement;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.List;
import java.util.Locale;

/** A mano y no con MapStruct: el diseño son mapas libres y los números del contrato, decimales. */
@Component
public class SystemDesignWebMapper {

    /** @return {@code null} si el proyecto no trae diseño de sistema */
    public SystemDesignDomain toDomain(SystemDesign system) {
        if (system == null) {
            return null;
        }
        NonFunctionalRequirements nfr = system.getNfr();
        return new SystemDesignDomain(system.getChoices(), system.getDeployments(), nfr == null ? null
                : new SystemDesignDomain.NonFunctional(number(nfr.getUsers()), number(nfr.getRps()), number(nfr.getLatencyMs()),
                number(nfr.getAvailability()), number(nfr.getBudgetUsd()), nfr.getCompliance()));
    }

    /** @return {@code null} si no hay diseño: el campo no viaja */
    public SystemDesign toDto(SystemDesignDomain design) {
        if (design == null) {
            return null;
        }
        SystemDesignDomain.NonFunctional nfr = design.nfr();
        return new SystemDesign()
                .choices(design.choices())
                .deployments(design.deployments())
                .nfr(new NonFunctionalRequirements()
                        .users(decimal(nfr.users())).rps(decimal(nfr.rps())).latencyMs(decimal(nfr.latencyMs()))
                        .availability(decimal(nfr.availability())).budgetUsd(decimal(nfr.budgetUsd()))
                        .compliance(nfr.compliance()));
    }

    public List<SystemDesignFinding> toFindings(List<SystemFindingDomain> findings) {
        return findings.stream().map(finding -> new SystemDesignFinding()
                .rule(finding.rule())
                .kind(finding.kind())
                .severity(finding.severity().name().toLowerCase(Locale.ROOT))
                .category(finding.category())
                .nodeId(finding.nodeId())
                .message(finding.message())
                .suggestion(finding.suggestion())).toList();
    }

    public SystemDesignBundle toDto(SystemDesignUseCase.Bundle bundle) {
        return new SystemDesignBundle()
                .files(bundle.files().stream().map(file -> new SystemDesignFile().path(file.path()).language(file.language()).content(file.content())).toList())
                .findings(toFindings(bundle.findings()));
    }

    public SystemDesignCatalog toDto(SystemDesignRules rules) {
        return new SystemDesignCatalog()
                .categories(rules.catalog().stream().map(category -> new SystemDesignCategory()
                        .id(category.id()).name(category.name()).question(category.question()).optional(category.optional())
                        .options(category.options().stream().map(option -> new SystemDesignOption()
                                .id(option.id()).name(option.name()).summary(option.summary()).deploysOn(option.deploysOn())
                                .notDeployed(option.notDeployed()).contract(option.contract())).toList())).toList())
                .requirements(rules.inputs().stream().map(input -> new SystemDesignRequirement()
                        .field(input.field()).name(input.name()).unit(input.unit())
                        .min(BigDecimal.valueOf(input.min())).max(BigDecimal.valueOf(input.max()))
                        .choices(input.choices() == null ? null : input.choices().stream().map(BigDecimal::valueOf).toList())
                        .help(input.help())).toList())
                .compliance(rules.compliance().stream().map(option -> new SystemDesignComplianceOption()
                        .id(option.id()).name(option.name()).help(option.help())).toList());
    }

    private static Double number(BigDecimal value) {
        return value == null ? null : value.doubleValue();
    }

    private static BigDecimal decimal(Double value) {
        return value == null ? null : BigDecimal.valueOf(value);
    }
}
