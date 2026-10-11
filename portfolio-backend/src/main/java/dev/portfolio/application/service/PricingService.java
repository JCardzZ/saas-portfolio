package dev.portfolio.application.service;

import dev.portfolio.application.port.in.PricingUseCase;
import dev.portfolio.application.port.out.PricingProviderPort;
import dev.portfolio.application.port.out.RateLimiterPort;
import dev.portfolio.domain.exception.InvalidRequestException;
import dev.portfolio.domain.exception.PricingUnavailableException;
import dev.portfolio.domain.exception.RateLimitExceededException;
import dev.portfolio.domain.model.CloudProviderDomain;
import dev.portfolio.domain.model.RateLimitDecision;
import dev.portfolio.domain.model.RateLimitPolicy;
import dev.portfolio.domain.model.pricing.PriceQuote;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.regex.Pattern;

/**
 * Cotiza los servicios de un lienzo. Quien pregunta solo nombra servicios del catálogo: qué SKU
 * se consulta y a qué dirección lo decide la plataforma, así que una petición no puede dirigir
 * las llamadas salientes. La falta de un precio nunca es un error: es una cotización sin precio.
 */
public class PricingService implements PricingUseCase {

    public static final int MAX_SERVICES = 60;
    private static final Pattern SERVICE_CODE = Pattern.compile("^[A-Za-z0-9_-]{1,48}$");

    private final PricingProviderPort pricing;
    private final RateLimiterPort rateLimiter;
    private final RateLimitPolicy policy;

    public PricingService(PricingProviderPort pricing, RateLimiterPort rateLimiter, RateLimitPolicy policy) {
        this.pricing = pricing;
        this.rateLimiter = rateLimiter;
        this.policy = policy;
    }

    @Override
    public List<PriceQuote> quote(CloudProviderDomain provider, List<String> serviceCodes, String clientKey) {
        RateLimitDecision decision = rateLimiter.tryAcquire("pricing:" + clientKey, policy);
        if (!decision.allowed()) {
            throw new RateLimitExceededException(decision.limit(), decision.retryAfter());
        }
        if (provider == null) {
            throw new InvalidRequestException("La cotización necesita una nube");
        }
        if (serviceCodes == null || serviceCodes.isEmpty()) {
            throw new InvalidRequestException("La cotización necesita al menos un servicio");
        }
        if (serviceCodes.size() > MAX_SERVICES) {
            throw new InvalidRequestException("No se pueden cotizar más de %d servicios a la vez".formatted(MAX_SERVICES));
        }
        if (serviceCodes.stream().anyMatch(code -> code == null || !SERVICE_CODE.matcher(code).matches())) {
            throw new InvalidRequestException("Cada servicio se identifica con letras, cifras, guiones o guiones bajos");
        }
        return new LinkedHashSet<>(serviceCodes).stream().map(code -> quoteOne(provider, code)).toList();
    }

    private PriceQuote quoteOne(CloudProviderDomain provider, String code) {
        try {
            return pricing.quote(provider, code);
        } catch (PricingUnavailableException e) {
            return PriceQuote.unknown(code, provider, "El proveedor de precios no responde ahora mismo.");
        }
    }
}
