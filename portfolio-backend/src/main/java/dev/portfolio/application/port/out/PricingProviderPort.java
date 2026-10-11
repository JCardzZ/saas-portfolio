package dev.portfolio.application.port.out;

import dev.portfolio.domain.exception.PricingUnavailableException;
import dev.portfolio.domain.model.CloudProviderDomain;
import dev.portfolio.domain.model.pricing.PriceQuote;

/**
 * Fuente de precios de lista de los servicios del catálogo. No dice nada del transporte: una
 * implementación puede leer una API pública, un fichero o no tener precio que dar.
 */
public interface PricingProviderPort {

    /** ¿Sabe esta fuente cotizar ese servicio en esa nube? */
    boolean supports(CloudProviderDomain provider, String serviceCode);

    /**
     * Cotiza un servicio que {@link #supports} admite. El SKU lo decide la fuente: quien pregunta
     * solo nombra el servicio.
     *
     * @throws PricingUnavailableException si la fuente no puede responder ahora
     */
    PriceQuote quote(CloudProviderDomain provider, String serviceCode);
}
