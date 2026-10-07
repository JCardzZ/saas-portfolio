package dev.portfolio.application.service;

import dev.portfolio.domain.model.CvContentDomain;
import dev.portfolio.domain.model.CvContentDomain.Block;
import dev.portfolio.domain.model.CvContentDomain.Kind;
import dev.portfolio.domain.model.CvContentDomain.Section;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

/**
 * Convierte el documento de trayectoria (Markdown) en el contenido de un CV:
 * <ul>
 *   <li>el primer título de nivel 1 es {@code Nombre — titular};</li>
 *   <li>cada título de nivel 1 siguiente abre una sección;</li>
 *   <li>un título de nivel 2 es una entrada de la sección; las líneas con guion, viñetas;
 *       el resto, párrafos.</li>
 * </ul>
 * Los comentarios HTML (notas para quien edita, marcadores) no forman parte del CV, salvo
 * {@code <!-- cv:sidebar -->}: puesto dentro de una sección, la marca como dato de apoyo.
 */
final class CvMarkdownParser {

    private static final Pattern ASIDE_MARKER = Pattern.compile("<!--\\s*cv:sidebar\\s*-->");
    private static final String ASIDE = "\u0000aside";
    private static final Pattern COMMENT = Pattern.compile("<!--.*?-->", Pattern.DOTALL);
    private static final Pattern NAME_SEPARATOR = Pattern.compile("\\s+[—–]\\s+");

    private CvMarkdownParser() {
    }

    static CvContentDomain parse(String markdown) {
        String name = "";
        String headline = "";
        List<Section> sections = new ArrayList<>();
        String sectionTitle = null;
        List<Block> blocks = new ArrayList<>();
        StringBuilder text = new StringBuilder();
        Kind open = null;
        boolean aside = false;

        String marked = ASIDE_MARKER.matcher(markdown).replaceAll("\n" + ASIDE + "\n");
        for (String raw : COMMENT.matcher(marked).replaceAll("").split("\\R")) {
            String line = raw.strip();
            if (line.equals(ASIDE)) {
                open = flush(blocks, open, text);
                aside = true;
                continue;
            }
            boolean continuation = open == Kind.BULLET && raw.startsWith(" ") && !line.isEmpty() && !isBullet(line);
            if (!continuation && (line.isEmpty() || line.startsWith("#") || isBullet(line))) {
                open = flush(blocks, open, text);
            }
            if (line.isEmpty()) {
                continue;
            }
            if (line.startsWith("# ")) {
                String title = line.substring(2).strip();
                if (name.isEmpty() && sectionTitle == null) {
                    String[] parts = NAME_SEPARATOR.split(title, 2);
                    name = parts[0];
                    headline = parts.length > 1 ? parts[1] : "";
                } else {
                    addSection(sections, sectionTitle, blocks, aside);
                    sectionTitle = title;
                    aside = false;
                }
            } else if (line.startsWith("#")) {
                blocks.add(new Block(Kind.HEADING, line.replaceFirst("^#+\\s*", "")));
            } else if (isBullet(line)) {
                open = Kind.BULLET;
                text.append(line.substring(2).strip());
            } else {
                open = open == null ? Kind.PARAGRAPH : open;
                text.append(text.isEmpty() ? "" : " ").append(line);
            }
        }
        flush(blocks, open, text);
        addSection(sections, sectionTitle, blocks, aside);
        return new CvContentDomain(name, headline, sections);
    }

    private static boolean isBullet(String line) {
        return line.startsWith("- ") || line.startsWith("* ");
    }

    private static Kind flush(List<Block> blocks, Kind open, StringBuilder text) {
        if (open != null && !text.isEmpty()) {
            blocks.add(new Block(open, text.toString()));
        }
        text.setLength(0);
        return null;
    }

    private static void addSection(List<Section> sections, String title, List<Block> blocks, boolean aside) {
        if (title != null && !blocks.isEmpty()) {
            sections.add(new Section(title, blocks, aside));
        }
        blocks.clear();
    }
}
