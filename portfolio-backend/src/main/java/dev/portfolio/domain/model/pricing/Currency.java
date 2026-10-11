package dev.portfolio.domain.model.pricing;

import java.util.regex.Pattern;

/**
 * Moneda de un precio, por su código ISO 4217. Es un valor propio (y no {@code java.util.Currency})
 * para que el dominio decida qué acepta: tres letras mayúsculas, nada más.
 */
public record Currency(String code) {

    private static final Pattern ISO_CODE = Pattern.compile("^[A-Z]{3}$");

    public static final Currency USD = new Currency("USD");

    public Currency {
        if (code == null || !ISO_CODE.matcher(code).matches()) {
            throw new IllegalArgumentException("La moneda debe ser un código ISO 4217 de tres letras mayúsculas");
        }
    }

    /** Admite el código en cualquier caja y con espacios alrededor, como llega de una API externa. */
    public static Currency of(String code) {
        return new Currency(code == null ? null : code.strip().toUpperCase());
    }

    @Override
    public String toString() {
        return code;
    }
}
