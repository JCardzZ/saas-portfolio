package dev.portfolio.infrastructure.adapter.out.career;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.ConstructorBinding;

/**
 * @param storyPath ruta del archivo CAREER_STORY.md; si no existe, la línea de tiempo queda vacía
 * @param cvContact línea de contacto que se imprime en el CV (correo, ciudad, enlace); opcional
 * @param photoPath ruta del archivo de la foto de perfil (JPEG o PNG); se crea al subirla desde administración
 */
@ConfigurationProperties(prefix = "career")
public record CareerProperties(String storyPath, String cvContact, String photoPath) {

    @ConstructorBinding
    public CareerProperties {
    }

    public CareerProperties(String storyPath) {
        this(storyPath, "", "");
    }

    public CareerProperties(String storyPath, String cvContact) {
        this(storyPath, cvContact, "");
    }
}
