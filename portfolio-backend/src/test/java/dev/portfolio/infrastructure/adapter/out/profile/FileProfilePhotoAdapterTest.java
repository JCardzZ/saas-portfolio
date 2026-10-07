package dev.portfolio.infrastructure.adapter.out.profile;

import dev.portfolio.application.service.ProfilePhotoService;
import dev.portfolio.domain.exception.InvalidRequestException;
import dev.portfolio.domain.exception.ResourceNotFoundException;
import dev.portfolio.domain.model.ProfilePhotoDomain;
import dev.portfolio.infrastructure.adapter.out.career.CareerProperties;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class FileProfilePhotoAdapterTest {

    private static final byte[] JPEG = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0, 1, 2, 3};
    private static final byte[] PNG = {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 9};

    private static ProfilePhotoService service(Path file) {
        return new ProfilePhotoService(new FileProfilePhotoAdapter(new CareerProperties("story.md", "", file.toString())));
    }

    @Test
    void storesReplacesAndRemovesThePhotoRecognisingItsTypeFromItsContent(@TempDir Path directory) throws IOException {
        Path file = directory.resolve("nested/profile-photo");
        ProfilePhotoService service = service(file);
        assertThatThrownBy(service::current).isInstanceOf(ResourceNotFoundException.class);

        service.upload(JPEG);
        assertThat(service.current().mediaType()).isEqualTo("image/jpeg");
        assertThat(Files.readAllBytes(file)).isEqualTo(JPEG);

        service.upload(PNG);
        assertThat(service.current()).isEqualTo(ProfilePhotoDomain.of(PNG));
        assertThat(service.current().mediaType()).isEqualTo("image/png");
        // Solo queda el archivo de la foto: nada temporal.
        try (var files = Files.list(file.getParent())) {
            assertThat(files).containsExactly(file);
        }

        service.remove();
        service.remove();
        assertThatThrownBy(service::current).isInstanceOf(ResourceNotFoundException.class);
    }

    @Test
    void rejectsWhatIsNotAJpegOrPngOfUpTo2Mb(@TempDir Path directory) {
        ProfilePhotoService service = service(directory.resolve("profile-photo"));

        assertThatThrownBy(() -> service.upload(new byte[0])).isInstanceOf(InvalidRequestException.class).hasMessage("La foto está vacía");
        assertThatThrownBy(() -> service.upload("<svg onload=alert(1)>".getBytes()))
                .isInstanceOf(InvalidRequestException.class).hasMessage("La foto debe ser una imagen JPEG o PNG");
        byte[] huge = new byte[ProfilePhotoDomain.MAX_BYTES + 1];
        System.arraycopy(JPEG, 0, huge, 0, JPEG.length);
        assertThatThrownBy(() -> service.upload(huge)).isInstanceOf(InvalidRequestException.class).hasMessage("La foto supera el máximo de 2 MB");
        assertThat(directory.resolve("profile-photo")).doesNotExist();
    }

    @Test
    void aFileLeftByHandThatIsNotAnImageIsIgnored(@TempDir Path directory) throws IOException {
        Path file = directory.resolve("profile-photo");
        Files.writeString(file, "esto no es una foto");

        assertThat(new FileProfilePhotoAdapter(new CareerProperties("story.md", "", file.toString())).load()).isEmpty();
        assertThat(new FileProfilePhotoAdapter(new CareerProperties("story.md")).load()).isEmpty();
    }
}
