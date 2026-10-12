package dev.portfolio.application.service;

import dev.portfolio.domain.model.HclSyntax;
import dev.portfolio.application.port.in.TerraformUseCase;
import dev.portfolio.application.port.out.RateLimiterPort;
import dev.portfolio.domain.exception.InvalidRequestException;
import dev.portfolio.domain.exception.RateLimitExceededException;
import dev.portfolio.domain.model.ArchitectureGraph;
import dev.portfolio.domain.model.CloudProviderDomain;
import dev.portfolio.domain.model.RateLimitDecision;
import dev.portfolio.domain.model.RateLimitPolicy;
import dev.portfolio.domain.model.TerraformBundleDomain;

import java.util.List;
import java.util.Map;

public class TerraformService implements TerraformUseCase {

    private final RateLimiterPort rateLimiter;
    private final RateLimitPolicy policy;

    public TerraformService(RateLimiterPort rateLimiter, RateLimitPolicy policy) {
        this.rateLimiter = rateLimiter;
        this.policy = policy;
    }

    @Override
    public TerraformBundleDomain generate(CloudProviderDomain provider, List<Map<String, Object>> nodes,
                                          List<Map<String, Object>> connections, String clientKey) {
        RateLimitDecision decision = rateLimiter.tryAcquire("terraform:" + clientKey, policy);
        if (!decision.allowed()) {
            throw new RateLimitExceededException(decision.limit(), decision.retryAfter());
        }
        if (provider == null) {
            throw new InvalidRequestException("La topología necesita una nube");
        }
        ArchitectureGraph.validate(nodes, connections, List.of());
        return checked(new TerraformBundleDomain(
                TerraformGenerator.mainTf(nodes, connections, provider),
                TerraformGenerator.variablesTf(nodes, provider)));
    }

    /**
     * Lo generado se comprueba antes de salir: un esqueleto con la sintaxis rota no se entrega.
     * Si pasa, es un fallo del generador, no de quien llama.
     */
    static TerraformBundleDomain checked(TerraformBundleDomain bundle) {
        List<String> errors = new java.util.ArrayList<>(HclSyntax.errors(bundle.mainTf()).stream().map(error -> "main.tf, " + error).toList());
        errors.addAll(HclSyntax.errors(bundle.variablesTf()).stream().map(error -> "variables.tf, " + error).toList());
        if (!errors.isEmpty()) {
            throw new IllegalStateException("El generador de Terraform produjo HCL mal formado: " + String.join("; ", errors));
        }
        return bundle;
    }
}
