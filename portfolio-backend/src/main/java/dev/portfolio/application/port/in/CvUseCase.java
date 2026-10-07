package dev.portfolio.application.port.in;

import dev.portfolio.domain.model.CvDocumentDomain;
import dev.portfolio.domain.model.CvLanguage;
import dev.portfolio.domain.model.CvType;

public interface CvUseCase {

    /**
     * @param withPhoto si las variantes maquetadas llevan la foto de perfil (o el avatar de iniciales
     *                  cuando no hay foto); la variante ATS nunca la lleva
     * @return el CV en PDF, generado a partir del documento de trayectoria
     * @throws dev.portfolio.domain.exception.ResourceNotFoundException si no hay trayectoria en ese idioma
     */
    CvDocumentDomain download(CvLanguage language, CvType type, boolean withPhoto);
}
