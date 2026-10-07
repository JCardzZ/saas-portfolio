package dev.portfolio.domain.model;

import java.time.Instant;
import java.util.regex.Pattern;

/**
 * @param slug identificador legible del artículo en URLs y en las citas del asistente
 */
public record ArticleDomain(String id, String title, String slug, String contentMarkdown, Instant publishedAt) {

    private static final Pattern SLUG = Pattern.compile("^[a-z0-9]+(-[a-z0-9]+)*$");

    /** Solo minúsculas, cifras y guiones sueltos: "migrando-a-hexagonal". */
    public static boolean isValidSlug(String slug) {
        return slug != null && SLUG.matcher(slug).matches();
    }
}
