package dev.portfolio.infrastructure.adapter.out.source;

import dev.portfolio.application.port.out.CodeSourcePort;
import dev.portfolio.domain.model.SourceDocumentDomain;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Lee el código fuente desde una carpeta. Lo indexado acaba siendo consultable desde un
 * endpoint público, así que solo entra una lista cerrada de extensiones y se descarta
 * todo lo que pueda contener credenciales.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class FileSystemCodeSourceAdapter implements CodeSourcePort {

    static final long MAX_FILE_BYTES = 200_000;
    static final int MAX_FILES = 2_000;
    /** Un archivo que contenga este marcador no se indexa (p. ej. una plantilla aún sin rellenar). */
    static final String SKIP_MARKER = "rag:skip";

    private static final Set<String> ALLOWED_EXTENSIONS =
            Set.of("java", "ts", "html", "css", "sql", "md", "yaml", "yml", "gradle", "tf");
    private static final Set<String> EXCLUDED_DIRECTORIES =
            Set.of("node_modules", "build", "dist", "target", "out", "coverage");
    // Rutas relativas a la raíz que no aportan: código autogenerado desde el contrato.
    private static final Set<String> EXCLUDED_PATHS = Set.of("portfolio-frontend/src/app/core/api");
    private static final List<String> SENSITIVE_NAME_PARTS =
            List.of("secret", "credential", "password", "tfvars", "tfstate");

    private final CodeSourceProperties properties;

    @Override
    public List<SourceDocumentDomain> loadDocuments() {
        if (!StringUtils.hasText(properties.codeRoot())) {
            log.info("Code indexing disabled: ai.rag.code-root is not set");
            return List.of();
        }
        Path root = Path.of(properties.codeRoot()).toAbsolutePath().normalize();
        if (!Files.isDirectory(root)) {
            log.warn("Code indexing skipped: '{}' is not a directory", root);
            return List.of();
        }

        List<SourceDocumentDomain> documents = new ArrayList<>();
        try {
            Files.walkFileTree(root, new SimpleFileVisitor<>() {
                @Override
                public FileVisitResult preVisitDirectory(Path directory, BasicFileAttributes attributes) {
                    return directory.equals(root) || isIndexableDirectory(root, directory)
                            ? FileVisitResult.CONTINUE
                            : FileVisitResult.SKIP_SUBTREE;
                }

                @Override
                public FileVisitResult visitFile(Path file, BasicFileAttributes attributes) {
                    if (attributes.isRegularFile() && attributes.size() <= MAX_FILE_BYTES && isIndexableFile(file)) {
                        read(root, file, documents);
                    }
                    if (documents.size() >= MAX_FILES) {
                        log.warn("Code indexing stopped at {} files; the rest of '{}' was not indexed", MAX_FILES, root);
                        return FileVisitResult.TERMINATE;
                    }
                    return FileVisitResult.CONTINUE;
                }

                @Override
                public FileVisitResult visitFileFailed(Path file, IOException e) {
                    log.warn("Could not access '{}': {}", file, e.getMessage());
                    return FileVisitResult.CONTINUE;
                }
            });
        } catch (IOException e) {
            log.warn("Code indexing aborted while walking '{}': {}", root, e.getMessage());
        }
        log.info("Loaded {} source files from '{}'", documents.size(), root);
        return documents;
    }

    private static boolean isIndexableDirectory(Path root, Path directory) {
        String name = directory.getFileName().toString();
        return !name.startsWith(".")
                && !EXCLUDED_DIRECTORIES.contains(name)
                && !EXCLUDED_PATHS.contains(relativePath(root, directory));
    }

    private static boolean isIndexableFile(Path file) {
        String name = file.getFileName().toString().toLowerCase(Locale.ROOT);
        if (name.startsWith(".") || name.startsWith("application")) {
            return false;
        }
        int dot = name.lastIndexOf('.');
        if (dot < 0 || !ALLOWED_EXTENSIONS.contains(name.substring(dot + 1))) {
            return false;
        }
        return SENSITIVE_NAME_PARTS.stream().noneMatch(name::contains);
    }

    private static void read(Path root, Path file, List<SourceDocumentDomain> documents) {
        try {
            String content = Files.readString(file, StandardCharsets.UTF_8);
            if (!content.isBlank() && !content.contains(SKIP_MARKER)) {
                documents.add(new SourceDocumentDomain(relativePath(root, file), content, Map.of()));
            }
        } catch (IOException e) {
            // Incluye archivos que no son UTF-8 válido.
            log.warn("Skipping unreadable file '{}': {}", file, e.getMessage());
        }
    }

    private static String relativePath(Path root, Path path) {
        return root.relativize(path).toString().replace('\\', '/');
    }
}
