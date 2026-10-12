package dev.portfolio.application.service;

import dev.portfolio.application.port.in.SystemDesignUseCase;
import dev.portfolio.application.port.out.ArchitectureProjectRepositoryPort;
import dev.portfolio.application.port.out.RateLimiterPort;
import dev.portfolio.domain.exception.InvalidRequestException;
import dev.portfolio.domain.exception.RateLimitExceededException;
import dev.portfolio.domain.model.ArchitectureGraph;
import dev.portfolio.domain.model.ArchitectureProjectDomain;
import dev.portfolio.domain.model.CloudProviderDomain;
import dev.portfolio.domain.model.RateLimitDecision;
import dev.portfolio.domain.model.RateLimitPolicy;
import dev.portfolio.domain.model.system.SystemDesignDomain;
import dev.portfolio.domain.model.system.SystemDesignRules;
import dev.portfolio.domain.model.system.SystemDesignRules.Category;
import dev.portfolio.domain.model.system.SystemDesignRules.Option;
import dev.portfolio.domain.model.system.SystemFindingDomain;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Comprueba un diseño de sistema y genera sus archivos de partida. Quien llama solo elige entre
 * lo que hay en el catálogo: una categoría o una opción desconocidas se rechazan, y nada de lo
 * que envía decide qué texto se genera más allá de esas elecciones.
 */
public class SystemDesignService implements SystemDesignUseCase {

    private final SystemDesignRules rules;
    private final RateLimiterPort rateLimiter;
    private final RateLimitPolicy policy;
    private final ArchitectureProjectRepositoryPort projects;

    public SystemDesignService(SystemDesignRules rules, RateLimiterPort rateLimiter, RateLimitPolicy policy,
                               ArchitectureProjectRepositoryPort projects) {
        this.projects = projects;
        this.rules = rules;
        this.rateLimiter = rateLimiter;
        this.policy = policy;
    }

    @Override
    public SystemDesignRules catalog() {
        return rules;
    }

    @Override
    public List<SystemFindingDomain> evaluate(Request request, String clientKey) {
        acquire(clientKey);
        Request checked = checked(request);
        return rules.evaluate(checked.design(), checked.nodes(), checked.costUsd(), checked.provider());
    }

    @Override
    public Bundle generate(Request request, String clientKey) {
        acquire(clientKey);
        return bundle(request);
    }

    private Bundle bundle(Request request) {
        Request checked = checked(request);
        SystemDesignDomain design = checked.design();
        List<SystemFindingDomain> findings = rules.evaluate(design, checked.nodes(), checked.costUsd(), checked.provider());

        List<GeneratedFile> files = new ArrayList<>();
        files.add(new GeneratedFile("main.tf", "hcl", TerraformGenerator.mainTf(checked.nodes(), checked.connections(), checked.provider())));
        files.add(new GeneratedFile("variables.tf", "hcl", TerraformGenerator.variablesTf(checked.nodes(), checked.provider())));
        String contract = rules.category("api").flatMap(category -> rules.chosen(design, category)).map(Option::contract).orElse(null);
        if ("openapi".equals(contract)) {
            files.add(new GeneratedFile("openapi.yaml", "yaml", SystemDesignGenerator.openApi(design)));
        } else if ("proto".equals(contract)) {
            files.add(new GeneratedFile("service.proto", "protobuf", SystemDesignGenerator.proto()));
        }
        files.add(new GeneratedFile("docker-compose.yml", "yaml", SystemDesignGenerator.dockerCompose(design)));
        List<String> names = files.stream().map(GeneratedFile::path).toList();
        files.add(new GeneratedFile("README.md", "markdown",
                SystemDesignGenerator.readme(design, rules, checked.nodes(), checked.provider(), names, findings)));
        return new Bundle(List.copyOf(files), findings);
    }

    @Override
    public Proposal design(Brief brief, String clientKey) {
        acquire(clientKey);
        // Los sistemas de ejemplo que trae la plataforma: plantillas con diseño de sistema.
        List<ArchitectureProjectDomain> templates = projects.findAll().stream()
                .filter(project -> project.preset() && project.system() != null).toList();
        if (templates.isEmpty()) {
            throw new InvalidRequestException("No hay sistemas de ejemplo de los que partir");
        }
        SystemDesignDomain asked = rules.validated(new SystemDesignDomain(brief.choices(), Map.of(), brief.nfr()));
        ArchitectureProjectDomain base = brief.template() == null ? closest(templates, asked) : templates.stream()
                .filter(template -> template.id().equals(brief.template())).findFirst()
                .orElseThrow(() -> new InvalidRequestException("Sistema de ejemplo desconocido: '%s'. Valores: %s"
                        .formatted(brief.template(), String.join(", ", templates.stream().map(ArchitectureProjectDomain::id).toList()))));

        Map<String, String> choices = new LinkedHashMap<>(base.system().choices());
        Map<String, String> deployments = new LinkedHashMap<>(base.system().deployments());
        List<String> adjusted = new ArrayList<>();
        for (Map.Entry<String, String> choice : asked.choices().entrySet()) {
            if (choice.getValue().equals(choices.put(choice.getKey(), choice.getValue()))) {
                continue;
            }
            // La elección cambia: su pieza se vuelve a desplegar en el primer nodo donde pueda correr.
            deployments.remove(choice.getKey());
            adjusted.add(choice.getKey());
            Category category = rules.category(choice.getKey()).orElseThrow();
            category.options().stream().filter(option -> option.id().equals(choice.getValue())).findFirst()
                    .flatMap(option -> base.nodes().stream().filter(node -> option.deploysOn().contains(node.get("type"))).findFirst())
                    .ifPresent(node -> deployments.put(choice.getKey(), String.valueOf(node.get("id"))));
        }
        CloudProviderDomain provider = brief.provider() == null ? base.cloudProvider() : brief.provider();
        SystemDesignDomain design = rules.validated(new SystemDesignDomain(choices, deployments, asked.nfr()));
        Request request = new Request(provider, base.nodes(), base.connections(), design, null);
        return new Proposal(base.id(), base.title(), provider, base.nodes(), base.connections(), design, List.copyOf(adjusted), bundle(request));
    }

    /** El sistema de ejemplo con más elecciones en común con lo pedido; a igualdad, el primero. */
    private static ArchitectureProjectDomain closest(List<ArchitectureProjectDomain> templates, SystemDesignDomain asked) {
        ArchitectureProjectDomain best = templates.get(0);
        long bestScore = -1;
        for (ArchitectureProjectDomain template : templates) {
            long score = asked.choices().entrySet().stream()
                    .filter(choice -> choice.getValue().equals(template.system().choices().get(choice.getKey()))).count();
            // Las regulaciones pesan: un sistema pensado para datos de tarjeta o de salud ya trae lo que piden.
            score += 2 * asked.nfr().compliance().stream().filter(template.system().nfr().compliance()::contains).count();
            if (score > bestScore) {
                best = template;
                bestScore = score;
            }
        }
        return best;
    }

    @Override
    public SystemDesignDomain validated(SystemDesignDomain design) {
        return rules.validated(design);
    }

    private Request checked(Request request) {
        if (request.provider() == null) {
            throw new InvalidRequestException("El diseño necesita una nube");
        }
        ArchitectureGraph.validate(request.nodes(), request.connections(), List.of());
        Double cost = request.costUsd();
        if (cost != null && (cost.isNaN() || cost.isInfinite() || cost < 0 || cost > SystemDesignRules.MAX_NUMBER)) {
            throw new InvalidRequestException("El coste estimado no es un número válido");
        }
        return new Request(request.provider(), request.nodes(), request.connections(), validated(request.design()), cost);
    }

    private void acquire(String clientKey) {
        RateLimitDecision decision = rateLimiter.tryAcquire("system-design:" + clientKey, policy);
        if (!decision.allowed()) {
            throw new RateLimitExceededException(decision.limit(), decision.retryAfter());
        }
    }
}
