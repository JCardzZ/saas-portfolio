package dev.portfolio.infrastructure.adapter.out.cv;

import dev.portfolio.application.service.CvService;
import dev.portfolio.domain.model.CvDocumentDomain;
import dev.portfolio.domain.model.CvLanguage;
import dev.portfolio.domain.model.CvType;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.rendering.ImageType;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * No es una prueba: exporta los seis CV, con una miniatura de cada uno, a una carpeta ({@code ./gradlew exportCv} los deja en
 * los estáticos del frontend, que los usa en modo demo). En {@code ./gradlew test} no se ejecuta.
 */
@EnabledIfSystemProperty(named = "cv.export.dir", matches = ".+")
class CvExportTest {

    private static final float PREVIEW_DPI = 60;

    @Test
    void exportsEveryVariant() throws IOException {
        Path directory = Files.createDirectories(Path.of(System.getProperty("cv.export.dir")));
        // La foto, si existe, es la del repositorio; sin ella sale el avatar de iniciales.
        CvService service = CvPdfRenderingTest.service(System.getProperty("cv.export.contact", ""), "../docs/career/profile-photo");

        for (CvLanguage language : CvLanguage.values()) {
            for (CvType type : CvType.values()) {
                export(service.download(language, type, true), directory, "cv-" + language.code() + "-" + type.code());
                if (type != CvType.ATS) {
                    export(service.download(language, type, false), directory, "cv-" + language.code() + "-" + type.code() + "-nophoto");
                }
            }
        }
    }

    /** El PDF y una miniatura de su primera página, para la vista previa del selector de descarga. */
    private static void export(CvDocumentDomain cv, Path directory, String name) throws IOException {
        Path file = directory.resolve(name + ".pdf");
        Files.write(file, cv.content());
        assertThat(file).isNotEmptyFile();
        try (PDDocument document = PDDocument.load(cv.content())) {
            BufferedImage page = new PDFRenderer(document).renderImageWithDPI(0, PREVIEW_DPI, ImageType.RGB);
            ImageIO.write(page, "png", directory.resolve(name + ".png").toFile());
        }
    }
}
