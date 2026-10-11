package dev.portfolio.domain.model.pricing;

import java.time.Instant;
import java.util.Optional;

/**
 * Precio de lista de un SKU concreto, tal como lo publica su proveedor.
 *
 * @param sku         nombre corto del SKU, el que se muestra («D2s_v5»)
 * @param description producto y medidor a los que corresponde, en palabras del proveedor
 * @param unitPrice   precio de una unidad
 * @param unit        qué es una unidad
 * @param region      región del proveedor a la que pertenece el precio
 * @param source      de dónde salió («Azure Retail Prices API»)
 * @param fetchedAt   cuándo se leyó del proveedor
 */
public record SkuPricing(String sku, String description, Money unitPrice, PricingUnit unit,
                         String region, String source, Instant fetchedAt) {

    public SkuPricing {
        if (sku == null || sku.isBlank()) {
            throw new IllegalArgumentException("Un precio necesita su SKU");
        }
        if (unitPrice == null || unit == null || fetchedAt == null) {
            throw new IllegalArgumentException("Un precio necesita importe, unidad y fecha de lectura");
        }
        description = description == null ? "" : description;
        region = region == null ? "" : region;
        source = source == null ? "" : source;
    }

    /** Lo que cuesta una unidad durante un mes de 730 horas, si la unidad es de tiempo. */
    public Optional<Money> monthlyCost() {
        return unit.monthlyFactor().map(unitPrice::times);
    }

    /** «$0.0960 USD/hr»: como se escribe en la traza. */
    public String display() {
        return "$" + unitPrice.formatted(4) + " " + unitPrice.currency() + "/" + unit.label();
    }
}
