package dev.portfolio.infrastructure.adapter.in.web.controller;

import dev.portfolio.api.ProfileApi;
import dev.portfolio.application.port.in.ProfilePhotoUseCase;
import dev.portfolio.domain.exception.InvalidRequestException;
import dev.portfolio.domain.model.ProfilePhotoDomain;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;

@RestController
@RequiredArgsConstructor
public class ProfileController implements ProfileApi {

    private final ProfilePhotoUseCase profilePhotoUseCase;

    @Override
    public ResponseEntity<Resource> publicProfilePhotoGet() {
        ProfilePhotoDomain photo = profilePhotoUseCase.current();
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(photo.mediaType()))
                // Puede cambiar en cualquier momento desde administración.
                .cacheControl(CacheControl.noCache())
                .body(new ByteArrayResource(photo.content()));
    }

    @Override
    public ResponseEntity<Void> adminProfilePhotoPut(MultipartFile file) {
        try {
            profilePhotoUseCase.upload(file.getBytes());
        } catch (IOException e) {
            throw new InvalidRequestException("No se pudo leer el archivo subido");
        }
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<Void> adminProfilePhotoDelete() {
        profilePhotoUseCase.remove();
        return ResponseEntity.noContent().build();
    }
}
