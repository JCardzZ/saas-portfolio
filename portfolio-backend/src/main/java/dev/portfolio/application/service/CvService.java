package dev.portfolio.application.service;

import dev.portfolio.application.port.in.CvUseCase;
import dev.portfolio.application.port.out.CareerStoryPort;
import dev.portfolio.application.port.out.CvRendererPort;
import dev.portfolio.application.port.out.CvRendererPort.Portrait;
import dev.portfolio.application.port.out.ProfilePhotoPort;
import dev.portfolio.domain.exception.ResourceNotFoundException;
import dev.portfolio.domain.model.CvContentDomain;
import dev.portfolio.domain.model.CvContentDomain.Block;
import dev.portfolio.domain.model.CvContentDomain.Kind;
import dev.portfolio.domain.model.CvContentDomain.Section;
import dev.portfolio.domain.model.CvDocumentDomain;
import dev.portfolio.domain.model.CvLanguage;
import dev.portfolio.domain.model.CvType;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Genera el CV a partir del documento de trayectoria, el mismo del que salen la línea de tiempo
 * y lo que sabe el asistente: no hay un PDF aparte que pueda quedarse desfasado.
 * El PDF de cada combinación se guarda en memoria junto al texto y la foto de los que salió; si
 * cambia cualquiera de los dos, la siguiente descarga lo regenera.
 */
public class CvService implements CvUseCase {

    /** Resumen de una página: cuánto se conserva de cada parte. */
    private static final int SHORT_FIELDS_PER_ENTRY = 3;
    private static final int SHORT_BULLETS_PER_SECTION = 4;

    private final CareerStoryPort careerStory;
    private final CvRendererPort renderer;
    private final ProfilePhotoPort photos;
    private final Map<String, Rendered> cache = new ConcurrentHashMap<>();

    public CvService(CareerStoryPort careerStory, CvRendererPort renderer, ProfilePhotoPort photos) {
        this.careerStory = careerStory;
        this.renderer = renderer;
        this.photos = photos;
    }

    @Override
    public CvDocumentDomain download(CvLanguage language, CvType type, boolean withPhoto) {
        String story = careerStory.loadStory(language).filter(text -> !text.isBlank())
                .orElseThrow(() -> new ResourceNotFoundException("CV", language.code()));
        // La variante ATS es solo texto: nunca lleva foto.
        Portrait portrait = withPhoto && type != CvType.ATS ? new Portrait(true, photos.load()) : Portrait.NONE;

        Rendered rendered = cache.compute(language.code() + "/" + type.code() + "/" + portrait.shown(), (key, cached) ->
                cached != null && cached.source().equals(story) && cached.portrait().equals(portrait)
                        ? cached : render(story, language, type, portrait));
        return rendered.document();
    }

    private Rendered render(String story, CvLanguage language, CvType type, Portrait portrait) {
        CvContentDomain content = CvMarkdownParser.parse(story);
        CvContentDomain shaped = type == CvType.SHORT ? summarise(content) : content;
        String filename = "cv-" + slug(content.name()) + "-" + language.code() + "-" + type.code() + ".pdf";
        return new Rendered(story, portrait, new CvDocumentDomain(filename, renderer.render(shaped, type, language, portrait)));
    }

    /**
     * Versión de una página. De cada entrada quedan su título, sus datos (rol, organización y
     * tecnologías) y la primera frase; de las secciones sin entradas, el primer párrafo y las
     * primeras viñetas.
     */
    static CvContentDomain summarise(CvContentDomain content) {
        List<Section> sections = new ArrayList<>();
        for (Section section : content.sections()) {
            boolean hasEntries = section.blocks().stream().anyMatch(block -> block.kind() == Kind.HEADING);
            List<Block> kept = new ArrayList<>();
            int bullets = 0;
            int paragraphs = 0;
            for (Block block : section.blocks()) {
                switch (block.kind()) {
                    case HEADING -> {
                        kept.add(block);
                        bullets = 0;
                        paragraphs = 0;
                    }
                    case BULLET -> {
                        if (bullets++ < (hasEntries ? SHORT_FIELDS_PER_ENTRY : SHORT_BULLETS_PER_SECTION)) {
                            kept.add(block);
                        }
                    }
                    case PARAGRAPH -> {
                        if (paragraphs++ == 0) {
                            kept.add(hasEntries ? new Block(Kind.PARAGRAPH, firstSentence(block.text())) : block);
                        }
                    }
                }
            }
            sections.add(new Section(section.title(), kept, section.aside()));
        }
        return new CvContentDomain(content.name(), content.headline(), sections);
    }

    private static String firstSentence(String text) {
        int end = text.indexOf(". ");
        return end < 0 ? text : text.substring(0, end + 1);
    }

    private static String slug(String name) {
        String ascii = Normalizer.normalize(name, Normalizer.Form.NFD).replaceAll("\\p{M}", "");
        String slug = ascii.toLowerCase().replaceAll("[^a-z0-9]+", "-").replaceAll("(^-|-$)", "");
        return slug.isEmpty() ? "cv" : slug;
    }

    private record Rendered(String source, Portrait portrait, CvDocumentDomain document) {
    }
}
