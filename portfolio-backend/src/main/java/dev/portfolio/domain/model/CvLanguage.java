package dev.portfolio.domain.model;

import dev.portfolio.domain.exception.InvalidRequestException;

import java.util.Arrays;

/** Idiomas en los que se ofrece el CV. */
public enum CvLanguage {
    ES("es"),
    EN("en");

    private final String code;

    CvLanguage(String code) {
        this.code = code;
    }

    public String code() {
        return code;
    }

    public static CvLanguage fromCode(String code) {
        return Arrays.stream(values()).filter(language -> language.code.equals(code)).findFirst()
                .orElseThrow(() -> new InvalidRequestException("Idioma de CV no admitido: '" + code + "'. Valores: es, en"));
    }
}
