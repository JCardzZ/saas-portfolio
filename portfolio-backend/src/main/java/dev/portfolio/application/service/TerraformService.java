package dev.portfolio.application.service;

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
        return new TerraformBundleDomain(
                TerraformGenerator.mainTf(nodes, connections, provider),
                TerraformGenerator.variablesTf(nodes, provider));
    }
}
