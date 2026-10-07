package dev.portfolio.application.port.in;

import dev.portfolio.domain.model.ProfilePhotoDomain;

public interface ProfilePhotoUseCase {

    /** @throws dev.portfolio.domain.exception.ResourceNotFoundException si no hay foto */
    ProfilePhotoDomain current();

    /** @throws dev.portfolio.domain.exception.InvalidRequestException si no es un JPEG o PNG de hasta 2 MB */
    void upload(byte[] content);

    void remove();
}
