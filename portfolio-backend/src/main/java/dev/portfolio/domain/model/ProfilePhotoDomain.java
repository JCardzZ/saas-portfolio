package dev.portfolio.domain.model;

import dev.portfolio.domain.exception.InvalidRequestException;

import java.util.Arrays;

/**
 * Foto de perfil. El tipo se deduce del contenido (su firma), no del nombre del archivo ni de
 * lo que declare quien la sube.
 */
public record ProfilePhotoDomain(byte[] content, String mediaType) {

    public static final int MAX_BYTES = 2 * 1024 * 1024;

    private static final byte[] JPEG = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF};
    private static final byte[] PNG = {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A};

    /** @throws InvalidRequestException si está vacía, pesa demasiado o no es JPEG ni PNG */
    public static ProfilePhotoDomain of(byte[] content) {
        if (content == null || content.length == 0) {
            throw new InvalidRequestException("La foto está vacía");
        }
        if (content.length > MAX_BYTES) {
            throw new InvalidRequestException("La foto supera el máximo de 2 MB");
        }
        if (startsWith(content, JPEG)) {
            return new ProfilePhotoDomain(content, "image/jpeg");
        }
        if (startsWith(content, PNG)) {
            return new ProfilePhotoDomain(content, "image/png");
        }
        throw new InvalidRequestException("La foto debe ser una imagen JPEG o PNG");
    }

    private static boolean startsWith(byte[] content, byte[] signature) {
        return content.length >= signature.length && Arrays.equals(content, 0, signature.length, signature, 0, signature.length);
    }

    // Un record con un array compara por referencia: aquí importa el contenido.
    @Override
    public boolean equals(Object other) {
        return other instanceof ProfilePhotoDomain photo && Arrays.equals(content, photo.content);
    }

    @Override
    public int hashCode() {
        return Arrays.hashCode(content);
    }

    @Override
    public String toString() {
        return "ProfilePhotoDomain[" + mediaType + ", " + content.length + " bytes]";
    }
}
