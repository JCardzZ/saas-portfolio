package dev.portfolio.application.service;

import dev.portfolio.domain.model.CvContentDomain;

/** Da acceso desde otros paquetes de test al analizador del documento, que es interno de la aplicación. */
public final class CvMarkdownParserAccess {

    private CvMarkdownParserAccess() {
    }

    public static CvContentDomain parse(String markdown) {
        return CvMarkdownParser.parse(markdown);
    }
}
