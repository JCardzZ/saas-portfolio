package dev.portfolio.infrastructure.adapter.out.profile;

import dev.portfolio.application.port.out.ProfilePhotoPort;
import dev.portfolio.domain.exception.InvalidRequestException;
import dev.portfolio.domain.model.ProfilePhotoDomain;
import dev.portfolio.infrastructure.adapter.out.career.CareerProperties;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Optional;

/**
 * Guarda la foto de perfil en un archivo, junto al documento de trayectoria. Se relee en cada
 * uso, así que también vale dejar el archivo ahí a mano. En un contenedor la ruta debe estar
 * en un volumen: si no, lo subido se pierde al recrearlo.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class FileProfilePhotoAdapter implements ProfilePhotoPort {

    private final CareerProperties properties;

    @Override
    public Optional<ProfilePhotoDomain> load() {
        Optional<Path> path = path().filter(Files::isRegularFile);
        if (path.isEmpty()) {
            return Optional.empty();
        }
        try {
            return Optional.of(ProfilePhotoDomain.of(Files.readAllBytes(path.get())));
        } catch (IOException | InvalidRequestException e) {
            log.warn("Profile photo at '{}' is not usable: {}", path.get(), e.getMessage());
            return Optional.empty();
        }
    }

    @Override
    public void save(ProfilePhotoDomain photo) {
        Path target = path().orElseThrow(() -> new IllegalStateException("career.photo-path no está configurado"));
        try {
            if (target.getParent() != null) {
                Files.createDirectories(target.getParent());
            }
            // Se escribe aparte y se mueve: quien lea a la vez nunca ve un archivo a medias.
            Path temporary = Files.createTempFile(target.toAbsolutePath().getParent(), "photo", ".tmp");
            Files.write(temporary, photo.content());
            Files.move(temporary, target, StandardCopyOption.REPLACE_EXISTING);
        } catch (IOException e) {
            throw new UncheckedIOException("No se pudo guardar la foto de perfil", e);
        }
    }

    @Override
    public void delete() {
        path().ifPresent(target -> {
            try {
                Files.deleteIfExists(target);
            } catch (IOException e) {
                throw new UncheckedIOException("No se pudo eliminar la foto de perfil", e);
            }
        });
    }

    private Optional<Path> path() {
        return StringUtils.hasText(properties.photoPath()) ? Optional.of(Path.of(properties.photoPath())) : Optional.empty();
    }
}
