package dev.portfolio.application.service;

import dev.portfolio.application.port.in.SystemDesignUseCase;
import dev.portfolio.application.port.out.RateLimiterPort;
import dev.portfolio.domain.exception.InvalidRequestException;
import dev.portfolio.domain.exception.RateLimitExceededException;
import dev.portfolio.domain.model.ArchitectureGraph;
import dev.portfolio.domain.model.RateLimitDecision;
import dev.portfolio.domain.model.RateLimitPolicy;
import dev.portfolio.domain.model.system.SystemDesignDomain;
import dev.portfolio.domain.model.system.SystemDesignRules;
import dev.portfolio.domain.model.system.SystemDesignRules.Option;
import dev.portfolio.domain.model.system.SystemFindingDomain;

import java.util.ArrayList;
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

    public SystemDesignService(SystemDesignRules rules, RateLimiterPort rateLimiter, RateLimitPolicy policy) {
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
