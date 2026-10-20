package dev.portfolio.infrastructure.adapter.out.career;

import dev.portfolio.application.port.out.CareerStoryPort;
import dev.portfolio.domain.model.CareerMilestoneDomain;
import dev.portfolio.domain.model.CvLanguage;
import dev.portfolio.domain.model.SourceDocumentDomain;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/** Lee la trayectoria del documento Markdown que mantiene el autor. Se relee en cada uso: editarlo basta. */
@Slf4j
@Component
@RequiredArgsConstructor
public class MarkdownCareerStoryAdapter implements CareerStoryPort {

    /** Origen con el que el asistente cita la trayectoria, sea cual sea la ruta real del archivo. */
    static final String SOURCE_ID = "docs/career/CAREER_STORY.md";
    /** Mientras el documento lleve este marcador (la plantilla lo trae), no se indexa en RAG. */
    static final String SKIP_MARKER = "rag:skip";

    private final CareerProperties properties;

    @Override
    public List<CareerMilestoneDomain> loadMilestones(CvLanguage language) {
        return loadStory(language).map(CareerStoryParser::parse).orElseGet(List::of);
    }

    @Override
    public Optional<SourceDocumentDomain> loadDocument() {
        return read()
                .filter(content -> !content.isBlank() && !content.contains(SKIP_MARKER))
                .map(content -> new SourceDocumentDomain(SOURCE_ID, content, Map.of()));
    }

    @Override
    public Optional<String> loadStory(CvLanguage language) {
        return language == CvLanguage.ES ? read() : read(translatedPath(language));
    }

    /** La traducción vive junto al original: {@code CAREER_STORY.md} → {@code CAREER_STORY.en.md}. */
    private String translatedPath(CvLanguage language) {
        String path = properties.storyPath();
        if (!StringUtils.hasText(path)) {
            return path;
        }
        int extension = path.lastIndexOf('.');
        return extension < 0 ? path + "." + language.code() : path.substring(0, extension) + "." + language.code() + path.substring(extension);
    }

    private Optional<String> read() {
        return read(properties.storyPath());
    }

    private Optional<String> read(String location) {
        if (!StringUtils.hasText(location)) {
            return Optional.empty();
        }
        Path path = Path.of(location);
        if (!Files.isRegularFile(path)) {
            log.info("Career story not found at '{}'", path.toAbsolutePath().normalize());
            return Optional.empty();
        }
        try {
            return Optional.of(Files.readString(path, StandardCharsets.UTF_8));
        } catch (IOException e) {
            log.warn("Career story at '{}' could not be read: {}", path, e.getMessage());
            return Optional.empty();
        }
    }
}
