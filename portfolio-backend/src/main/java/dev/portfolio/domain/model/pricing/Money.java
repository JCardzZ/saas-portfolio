package dev.portfolio.domain.model.pricing;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * Un importe en una moneda. Invariantes: el importe existe, no es negativo y nunca se operan
 * dos monedas distintas. Se guarda con la precisión con la que llega (las tarifas por hora
 * tienen hasta seis decimales); redondear es cosa de quien lo muestra.
 */
public record Money(BigDecimal amount, Currency currency) {

    public Money {
        if (amount == null || currency == null) {
            throw new IllegalArgumentException("Un importe necesita cantidad y moneda");
        }
        if (amount.signum() < 0) {
            throw new IllegalArgumentException("Un precio no puede ser negativo");
        }
        // 0.0960 y 0.096 son el mismo importe: sin ceros de más, equals y hashCode coinciden.
        amount = amount.signum() == 0 ? BigDecimal.ZERO : amount.stripTrailingZeros();
        if (amount.scale() < 0) {
            amount = amount.setScale(0, RoundingMode.UNNECESSARY);
        }
    }

    public static Money of(String amount, Currency currency) {
        return new Money(new BigDecimal(amount), currency);
    }

    public static Money usd(String amount) {
        return of(amount, Currency.USD);
    }

    public Money times(BigDecimal factor) {
        if (factor == null || factor.signum() < 0) {
            throw new IllegalArgumentException("El factor no puede ser negativo");
        }
        return new Money(amount.multiply(factor), currency);
    }

    public Money plus(Money other) {
        if (!currency.equals(other.currency)) {
            throw new IllegalArgumentException("No se suman importes en monedas distintas: " + currency + " y " + other.currency);
        }
        return new Money(amount.add(other.amount), currency);
    }

    /** El importe con un número fijo de decimales, p. ej. {@code 0.0960} con cuatro. */
    public String formatted(int decimals) {
        return amount.setScale(decimals, RoundingMode.HALF_UP).toPlainString();
    }
}
