package dev.portfolio.domain.model.pricing;

import java.math.BigDecimal;
import java.util.Optional;

/** Unidad en la que un proveedor cobra un SKU. */
public enum PricingUnit {

    HOURLY("hr"),
    MONTHLY("mes"),
    PER_GB("GB");

    /** Horas de un mes a efectos de facturación: la convención de las calculadoras de las tres nubes. */
    public static final BigDecimal HOURS_PER_MONTH = BigDecimal.valueOf(730);

    private final String label;

    PricingUnit(String label) {
        this.label = label;
    }

    /** Abreviatura con la que se escribe tras el precio: «USD/hr». */
    public String label() {
        return label;
    }

    /**
     * Por cuánto se multiplica el precio unitario para tener el de un mes de una unidad. Vacío si
     * la unidad no es tiempo: un precio por GB no dice nada de un mes sin saber cuántos GB.
     */
    public Optional<BigDecimal> monthlyFactor() {
        return switch (this) {
            case HOURLY -> Optional.of(HOURS_PER_MONTH);
            case MONTHLY -> Optional.of(BigDecimal.ONE);
            case PER_GB -> Optional.empty();
        };
    }
}
