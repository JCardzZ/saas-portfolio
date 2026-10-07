package dev.portfolio.application.port.out;

import dev.portfolio.domain.model.ProfilePhotoDomain;

import java.util.Optional;

public interface ProfilePhotoPort {

    /** @return la foto guardada; vacío si no hay ninguna o lo guardado no es una imagen válida */
    Optional<ProfilePhotoDomain> load();

    void save(ProfilePhotoDomain photo);

    void delete();
}
