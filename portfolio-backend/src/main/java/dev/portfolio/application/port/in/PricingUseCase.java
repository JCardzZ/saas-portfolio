package dev.portfolio.application.port.in;

import dev.portfolio.domain.model.CloudProviderDomain;
import dev.portfolio.domain.model.pricing.PriceQuote;

import java.util.List;

public interface PricingUseCase {

    /**
     * Cotiza los servicios de un lienzo en una nube: una cotización por código distinto, en el
     * orden recibido. Nunca falla porque un proveedor no responda.
     *
     * @param clientKey identifica a quien pregunta, para limitar sus peticiones
     */
    List<PriceQuote> quote(CloudProviderDomain provider, List<String> serviceCodes, String clientKey);
}
