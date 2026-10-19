package dev.portfolio.infrastructure.adapter.out.career;

import dev.portfolio.domain.model.CareerMilestoneDomain;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Extrae los hitos de CAREER_STORY.md. Solo se lee lo que hay entre los marcadores
 * {@code timeline:start} y {@code timeline:end}; el resto del documento es contexto para RAG.
 * <pre>
 * ## 2023 - 2025 — Título del hito
 * - **Rol:** Staff Engineer
 * - **Organización:** Acme
 * - **Tecnologías:** Java 21, Spring Boot 3
 *
 * Resumen en uno o varios párrafos.
 * </pre>
 */
final class CareerStoryParser {

    static final String START_MARKER = "timeline:start";
    static final String END_MARKER = "timeline:end";
    /** Un hito con este texto sigue sin rellenar y no se publica. */
    static final String PLACEHOLDER = "[COMPLETAR";

    private static final Pattern HEADING = Pattern.compile("^##\\s+(.+)$");
    // Separador entre periodo y título: la raya (—) o la semirraya (–) si existen...
    private static final Pattern DASH = Pattern.compile("\\s+[—–]\\s+");
    // ...y si no, el último guion, porque el propio periodo suele llevar uno ("2023 - 2025").
    private static final String HYPHEN = " - ";
    private static final Pattern FIELD = Pattern.compile("^[-*]\\s+\\*\\*(.+?):?\\*\\*:?\\s*(.*)$");

    private CareerStoryParser() {
    }

    static List<CareerMilestoneDomain> parse(String markdown) {
        List<CareerMilestoneDomain> milestones = new ArrayList<>();
        Draft current = null;
        boolean inside = false;

        for (String raw : markdown.split("\\R")) {
            String line = raw.strip();
            if (line.contains(START_MARKER)) {
                inside = true;
                continue;
            }
            if (line.contains(END_MARKER)) {
                break;
            }
            if (!inside) {
                continue;
            }

            String[] heading = splitHeading(line);
            if (heading != null) {
                addIfComplete(milestones, current);
                current = new Draft(heading[0], heading[1]);
            } else if (line.startsWith("#")) {
                // Cualquier otro título cierra el hito: lo que sigue ya no es su resumen.
                addIfComplete(milestones, current);
                current = null;
            } else if (current != null) {
                current.read(line);
            }
        }
        addIfComplete(milestones, current);
        return milestones;
    }

    /** @return {periodo, título} si la línea es un título de hito; {@code null} en otro caso */
    private static String[] splitHeading(String line) {
        Matcher heading = HEADING.matcher(line);
        if (!heading.matches()) {
            return null;
        }
        String text = heading.group(1).strip();
        Matcher dash = DASH.matcher(text);
        if (dash.find()) {
            return new String[]{text.substring(0, dash.start()).strip(), text.substring(dash.end()).strip()};
        }
        int hyphen = text.lastIndexOf(HYPHEN);
        if (hyphen <= 0) {
            return null;
        }
        return new String[]{text.substring(0, hyphen).strip(), text.substring(hyphen + HYPHEN.length()).strip()};
    }

    private static void addIfComplete(List<CareerMilestoneDomain> milestones, Draft draft) {
        if (draft != null && draft.isPublishable()) {
            milestones.add(draft.build());
        }
    }

    private static final class Draft {
        private final String period;
        private final String title;
        private String role;
        private String organization;
        private List<String> technologies = List.of();
        private final StringBuilder summary = new StringBuilder();
        private final StringBuilder everything = new StringBuilder();

        Draft(String period, String title) {
            this.period = period;
            this.title = title;
            everything.append(period).append(title);
        }

        void read(String line) {
            everything.append(line);
            Matcher field = FIELD.matcher(line);
            if (field.matches()) {
                String value = field.group(2).strip();
                switch (normalize(field.group(1))) {
                    // Campos del original y de su traducción al inglés.
                    case "rol", "role" -> role = value;
                    case "organizacion", "organisation", "organization" -> organization = value;
                    case "tecnologias", "technologies" -> technologies = Arrays.stream(value.split(","))
                            .map(String::strip).filter(item -> !item.isEmpty()).toList();
                    default -> appendSummary(line);
                }
            } else if (!line.isEmpty()) {
                appendSummary(line);
            }
        }

        boolean isPublishable() {
            return !everything.toString().contains(PLACEHOLDER) && !summary.isEmpty();
        }

        CareerMilestoneDomain build() {
            return new CareerMilestoneDomain(period, title, role, organization, technologies, summary.toString());
        }

        private void appendSummary(String line) {
            if (!summary.isEmpty()) {
                summary.append(' ');
            }
            summary.append(line);
        }

        private static String normalize(String key) {
            return key.strip().toLowerCase()
                    .replace('á', 'a').replace('é', 'e').replace('í', 'i').replace('ó', 'o').replace('ú', 'u');
        }
    }
}
