package dev.portfolio.application.service;

import dev.portfolio.application.port.out.PricingProviderPort;
import dev.portfolio.domain.model.CloudProviderDomain;
import dev.portfolio.domain.model.pricing.PriceQuote;

import java.util.List;

/**
 * Reparte cada cotización a la primera fuente que sabe darla. Añadir una nube es añadir una
 * fuente a la lista: nada de aquí cambia. La última de la lista debe admitirlo todo.
 */
public class PricingProviderRouter implements PricingProviderPort {

    private final List<PricingProviderPort> providers;

    public PricingProviderRouter(List<PricingProviderPort> providers) {
        this.providers = List.copyOf(providers);
    }

    @Override
    public boolean supports(CloudProviderDomain provider, String serviceCode) {
        return providers.stream().anyMatch(candidate -> candidate.supports(provider, serviceCode));
    }

    @Override
    public PriceQuote quote(CloudProviderDomain provider, String serviceCode) {
        return providers.stream()
                .filter(candidate -> candidate.supports(provider, serviceCode))
                .findFirst()
                .map(candidate -> candidate.quote(provider, serviceCode))
                .orElseGet(() -> PriceQuote.unknown(serviceCode, provider, "Ninguna fuente de precios cubre este servicio."));
    }
}
