package dev.portfolio.domain.model;

import java.math.BigDecimal;

/**
 * Un servicio del catálogo en una nube concreta.
 *
 * @param code               clase de servicio, común a sus equivalentes en las demás nubes (p. ej. {@code nosql})
 * @param defaultMonthlyCost coste mensual orientativo en USD; no es un precio en vivo
 * @param enterprise         suele adoptarse a escala de empresa
 */
public record CloudCatalogItemDomain(
        String id,
        CloudProviderDomain provider,
        String code,
        String name,
        String category,
        BigDecimal defaultMonthlyCost,
        boolean enterprise
) {
    public static String idOf(CloudProviderDomain provider, String code) {
        return provider.code() + ":" + code;
    }
}
