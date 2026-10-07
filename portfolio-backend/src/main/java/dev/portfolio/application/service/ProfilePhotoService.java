package dev.portfolio.application.service;

import dev.portfolio.application.port.in.ProfilePhotoUseCase;
import dev.portfolio.application.port.out.ProfilePhotoPort;
import dev.portfolio.domain.exception.ResourceNotFoundException;
import dev.portfolio.domain.model.ProfilePhotoDomain;

public class ProfilePhotoService implements ProfilePhotoUseCase {

    private final ProfilePhotoPort photos;

    public ProfilePhotoService(ProfilePhotoPort photos) {
        this.photos = photos;
    }

    @Override
    public ProfilePhotoDomain current() {
        return photos.load().orElseThrow(() -> new ResourceNotFoundException("ProfilePhoto", "current"));
    }

    @Override
    public void upload(byte[] content) {
        photos.save(ProfilePhotoDomain.of(content));
    }

    @Override
    public void remove() {
        photos.delete();
    }
}
