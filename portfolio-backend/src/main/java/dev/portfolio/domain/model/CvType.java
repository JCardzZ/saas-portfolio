package dev.portfolio.domain.model;

import dev.portfolio.domain.exception.InvalidRequestException;

import java.util.Arrays;

/** Variantes del CV: resumen de una página, completo y texto plano para sistemas de selección (ATS). */
public enum CvType {
    SHORT("short"),
    FULL("full"),
    ATS("ats");

    private final String code;

    CvType(String code) {
        this.code = code;
    }

    public String code() {
        return code;
    }

    public static CvType fromCode(String code) {
        return Arrays.stream(values()).filter(type -> type.code.equals(code)).findFirst()
                .orElseThrow(() -> new InvalidRequestException("Tipo de CV no admitido: '" + code + "'. Valores: short, full, ats"));
    }
}
