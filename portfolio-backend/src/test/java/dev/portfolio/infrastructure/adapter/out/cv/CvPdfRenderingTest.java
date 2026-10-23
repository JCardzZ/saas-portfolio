package dev.portfolio.infrastructure.adapter.out.cv;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import dev.portfolio.application.service.CvMarkdownParserAccess;
import dev.portfolio.application.service.CvService;
import dev.portfolio.domain.model.CvContentDomain;
import dev.portfolio.domain.model.CvDocumentDomain;
import dev.portfolio.domain.model.CvLanguage;
import dev.portfolio.domain.model.CvType;
import dev.portfolio.infrastructure.adapter.out.career.CareerProperties;
import dev.portfolio.infrastructure.adapter.out.career.MarkdownCareerStoryAdapter;
import dev.portfolio.infrastructure.adapter.out.profile.FileProfilePhotoAdapter;
import dev.portfolio.application.port.out.CvRendererPort.Portrait;
import org.junit.jupiter.api.io.TempDir;
import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.nio.file.Path;
import java.util.Optional;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** Genera los CV reales, a partir de los documentos de trayectoria del repositorio. */
class CvPdfRenderingTest {

    static final String STORY_PATH = "../docs/career/CAREER_STORY.md";

    static CvService service(String contact) {
        return service(contact, "");
    }

    static CvService service(String contact, String photoPath) {
        CareerProperties properties = new CareerProperties(STORY_PATH, contact, photoPath);
        return new CvService(new MarkdownCareerStoryAdapter(properties),
                new CvRendererAdapter(new StyledCvPdfWriter(properties), new PlainCvPdfWriter(properties)),
                new FileProfilePhotoAdapter(properties));
    }

    private static int images(CvDocumentDomain cv) throws IOException {
        try (PDDocument document = PDDocument.load(cv.content())) {
            int count = 0;
            for (var name : document.getPage(0).getResources().getXObjectNames()) {
                count += document.getPage(0).getResources().isImageXObject(name) ? 1 : 0;
            }
            return count;
        }
    }

    private static String fontName(PDDocument document, org.apache.pdfbox.cos.COSName name) {
        try {
            return document.getPage(0).getResources().getFont(name).getName();
        } catch (IOException e) {
            throw new java.io.UncheckedIOException(e);
        }
    }

    private static String text(CvDocumentDomain cv) throws IOException {
        try (PDDocument document = PDDocument.load(cv.content())) {
            return new PDFTextStripper().getText(document).replaceAll("\\s+", " ");
        }
    }

    private static int pages(CvDocumentDomain cv) throws IOException {
        try (PDDocument document = PDDocument.load(cv.content())) {
            return document.getNumberOfPages();
        }
    }

    @Test
    void theFullSpanishCvCarriesTheWholeStoryAsSearchableText() throws IOException {
        CvDocumentDomain cv = service("").download(CvLanguage.ES, CvType.FULL, true);

        assertThat(cv.filename()).isEqualTo("cv-manuel-de-jesus-cardoza-cardoza-es-full.pdf");
        assertThat(new String(cv.content(), 0, 5)).isEqualTo("%PDF-");
        assertThat(text(cv))
                .contains("Manuel de Jesús Cardoza Cardoza", "Senior Backend & API Platform Engineer", "EXPERIENCIA PROFESIONAL")
                .contains("Banco Agrícola", "Banco Davivienda", "Tribunal Supremo Electoral", "IBM MQ Series")
                .contains("Desarrollador Java Broker · Banco Agrícola", "COMPETENCIAS", "FORMACIÓN", "STACK")
                // Ni marcas de Markdown ni notas para quien edita.
                .doesNotContain("**").doesNotContain("timeline").doesNotContain("Fuente única").doesNotContain("cv:sidebar");
    }

    @Test
    void theDesignedCvEmbedsInterAndPutsStackAndEducationInTheSidebar() throws IOException {
        CvDocumentDomain cv = service("").download(CvLanguage.ES, CvType.FULL, true);

        try (PDDocument document = PDDocument.load(cv.content())) {
            List<String> fonts = new ArrayList<>();
            document.getPage(0).getResources().getFontNames()
                    .forEach(name -> fonts.add(fontName(document, name)));
            assertThat(fonts).isNotEmpty().allMatch(font -> font.contains("Inter"));
        }
        // La barra lateral se escribe antes que la columna principal: formación antes que el perfil.
        String text = text(cv);
        assertThat(text.indexOf("FORMACIÓN")).isLessThan(text.indexOf("PERFIL"));
        assertThat(text.indexOf("STACK")).isLessThan(text.indexOf("FORMACIÓN"));
    }

    @Test
    void theSidebarStackIsTheMostRepeatedTechnologiesOfTheStory() throws IOException {
        CareerProperties properties = new CareerProperties(STORY_PATH, "");
        String story = new MarkdownCareerStoryAdapter(properties).loadStory(CvLanguage.ES).orElseThrow();
        CvContentDomain content = CvMarkdownParserAccess.parse(story);

        assertThat(StyledCvPdfWriter.topTechnologies(content, 4)).containsExactly("Java", "Spring Boot", "Docker", "OAuth2");
        assertThat(new StyledCvPdfWriter(properties).html(content, false, CvLanguage.ES, Portrait.NONE))
                .contains("<span class=\"badge\">Java</span>", "<span class=\"chip\">Spring Batch</span>")
                .contains("<div class=\"period\">may 2022 - ene 2024</div>", "<div class=\"meta\">Desarrollador Java Broker  ·  Banco Agrícola</div>")
                .doesNotContain("Contacto");
    }

    @Test
    void theShortCvFitsOnOnePageInBothLanguages() throws IOException {
        for (CvLanguage language : CvLanguage.values()) {
            CvDocumentDomain cv = service("").download(language, CvType.SHORT, true);
            assertThat(pages(cv)).as(language.code()).isEqualTo(1);
            // De cada entrada queda la primera frase; las tecnologías siguen, como etiquetas.
            assertThat(text(cv)).contains("Banco Davivienda", "RabbitMQ", "STACK")
                    .doesNotContain(language == CvLanguage.ES ? "El trabajo incluye" : "The work includes");
        }
        assertThat(pages(service("").download(CvLanguage.ES, CvType.FULL, true))).isGreaterThanOrEqualTo(pages(service("").download(CvLanguage.ES, CvType.SHORT, true)));
    }

    @Test
    void theEnglishCvComesFromTheTranslationAndLeavesItsEditorNoteOut() throws IOException {
        String english = text(service("").download(CvLanguage.EN, CvType.FULL, true));

        assertThat(english).contains("Senior Backend & API Platform Engineer", "PROFESSIONAL EXPERIENCE", "Java Broker Developer · Banco Agrícola", "EDUCATION")
                .doesNotContain("rag:skip").doesNotContain("Experiencia profesional");
    }

    @Test
    void theAtsCvIsPlainTextWithEveryKeyword() throws IOException {
        CvDocumentDomain ats = service("").download(CvLanguage.EN, CvType.ATS, true);

        assertThat(text(ats)).contains("Technologies: Java, Spring Boot, OAuth2, Apache Kafka, RabbitMQ, Docker")
                .contains("- REST, SOAP and GraphQL services").doesNotContain("•");
        // Sin color de acento ni líneas: solo texto negro.
        assertThat(new String(ats.content(), java.nio.charset.StandardCharsets.ISO_8859_1)).doesNotContain("0 0.4 0.8 rg");
    }

    @Test
    void theContactLineIsPrintedOnlyWhenConfigured() throws IOException {
        CvService configured = service("San Salvador | ejemplo@correo.test");
        assertThat(text(configured.download(CvLanguage.ES, CvType.SHORT, true))).contains("CONTACTO", "San Salvador", "ejemplo@correo.test");
        assertThat(text(configured.download(CvLanguage.EN, CvType.SHORT, true))).contains("CONTACT ").doesNotContain("CONTACTO");
        assertThat(text(configured.download(CvLanguage.ES, CvType.ATS, true))).contains("San Salvador | ejemplo@correo.test");
        assertThat(text(service("").download(CvLanguage.ES, CvType.SHORT, true))).doesNotContain("@");
    }

    @Test
    void thePortraitFrameShowsTheUploadedPhotoOrTheInitialsAndCanBeLeftOut(@TempDir Path directory) throws IOException {
        Path photo = directory.resolve("profile-photo");
        ImageIO.write(new BufferedImage(40, 60, BufferedImage.TYPE_INT_RGB), "png", photo.toFile());

        // Con foto: va incrustada en la primera página, recortada al marco.
        CvService withPhoto = service("", photo.toString());
        assertThat(images(withPhoto.download(CvLanguage.ES, CvType.FULL, true))).isEqualTo(1);
        assertThat(pages(withPhoto.download(CvLanguage.ES, CvType.SHORT, true))).isEqualTo(1);
        assertThat(pages(withPhoto.download(CvLanguage.EN, CvType.SHORT, true))).isEqualTo(1);
        // La misma persona puede pedir el CV sin ella.
        assertThat(images(withPhoto.download(CvLanguage.ES, CvType.FULL, false))).isZero();
        assertThat(images(withPhoto.download(CvLanguage.ES, CvType.ATS, true))).isZero();

        // Sin foto subida: iniciales sobre degradado, dibujadas en vectorial.
        assertThat(images(service("").download(CvLanguage.ES, CvType.FULL, true))).isZero();
        String avatar = StyledCvPdfWriter.portrait(new Portrait(true, Optional.empty()), "Manuel de Jesús Cardoza Cardoza");
        assertThat(avatar).contains(">MC</text>", "url(#neon)", "stroke=\"#1E293B\"").doesNotContain("<img");
        assertThat(StyledCvPdfWriter.portrait(new Portrait(true, withPhotoDomain(photo)), "x"))
                .startsWith("<img width=\"104\" height=\"108\"").contains("data:image/png;base64,").doesNotContain("<text");
    }

    @Test
    void initialsAreTheFirstNameAndTheFirstSurname() {
        assertThat(StyledCvPdfWriter.initials("Manuel de Jesús Cardoza Cardoza")).isEqualTo("MC");
        assertThat(StyledCvPdfWriter.initials("Ana Núñez López")).isEqualTo("AN");
        assertThat(StyledCvPdfWriter.initials("Ada Lovelace")).isEqualTo("AL");
        assertThat(StyledCvPdfWriter.initials("Cher")).isEqualTo("C");
        assertThat(StyledCvPdfWriter.initials(" ")).isEmpty();
    }

    private static Optional<dev.portfolio.domain.model.ProfilePhotoDomain> withPhotoDomain(Path photo) {
        return new FileProfilePhotoAdapter(new CareerProperties(STORY_PATH, "", photo.toString())).load();
    }
}
