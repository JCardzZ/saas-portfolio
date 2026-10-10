package dev.portfolio.domain.model.pricing;

import dev.portfolio.domain.model.CloudProviderDomain;

import java.util.Optional;

/**
 * Respuesta a «¿cuánto cuesta este servicio en esta nube?». Invariante: lleva precio si y solo
 * si su estado dice que lo hay; así nadie puede leer un cero donde lo que falta es el dato.
 *
 * @param serviceCode código del servicio en el catálogo del Estudio («vm», «snowflake»)
 * @param pricing     el precio, o {@code null} si el estado no lo trae
 * @param note        qué cubre el precio o por qué no lo hay
 */
public record PriceQuote(String serviceCode, CloudProviderDomain provider, PricingStatus status, SkuPricing pricing, String note) {

    public PriceQuote {
        if (serviceCode == null || serviceCode.isBlank() || provider == null || status == null) {
            throw new IllegalArgumentException("Una cotización necesita servicio, nube y estado");
        }
        if (status.priced() != (pricing != null)) {
            throw new IllegalArgumentException("La cotización lleva precio si y solo si su estado lo indica: " + status);
        }
        note = note == null ? "" : note;
    }

    public static PriceQuote priced(String serviceCode, CloudProviderDomain provider, PricingStatus status, SkuPricing pricing, String note) {
        return new PriceQuote(serviceCode, provider, status, pricing, note);
    }

    public static PriceQuote unknown(String serviceCode, CloudProviderDomain provider, String note) {
        return new PriceQuote(serviceCode, provider, PricingStatus.UNKNOWN_PRICING, null, note);
    }

    public static PriceQuote enterpriseLicense(String serviceCode, CloudProviderDomain provider, String note) {
        return new PriceQuote(serviceCode, provider, PricingStatus.UNESTIMATED_ENTERPRISE_LICENSE, null, note);
    }

    public Optional<SkuPricing> price() {
        return Optional.ofNullable(pricing);
    }

    /** La misma cotización con otro estado (p. ej. una tarifa de caché que pasa de LIVE a CACHED). */
    public PriceQuote as(PricingStatus other) {
        return new PriceQuote(serviceCode, provider, other, pricing, note);
    }
}
