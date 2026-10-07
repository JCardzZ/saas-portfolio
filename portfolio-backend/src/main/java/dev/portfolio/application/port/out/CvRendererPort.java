package dev.portfolio.application.port.out;

import dev.portfolio.domain.model.CvContentDomain;
import dev.portfolio.domain.model.CvLanguage;
import dev.portfolio.domain.model.CvType;
import dev.portfolio.domain.model.ProfilePhotoDomain;

import java.util.Optional;

public interface CvRendererPort {

    /**
     * @param language idioma de los rótulos que pone la maqueta
     * @param portrait qué va en el marco de la foto
     * @return el PDF del contenido, maquetado según la variante
     */
    byte[] render(CvContentDomain content, CvType type, CvLanguage language, Portrait portrait);

    /**
     * Marco de la foto en las variantes maquetadas.
     *
     * @param shown si hay marco; sin él, el CV va sin foto
     * @param photo la foto; vacía = avatar con las iniciales
     */
    record Portrait(boolean shown, Optional<ProfilePhotoDomain> photo) {
        public static final Portrait NONE = new Portrait(false, Optional.empty());
    }
}
