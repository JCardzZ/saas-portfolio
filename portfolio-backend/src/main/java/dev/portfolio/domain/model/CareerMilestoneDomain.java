package dev.portfolio.domain.model;

import java.util.List;

/**
 * Hito de la trayectoria profesional.
 *
 * @param period texto libre del periodo, tal como lo escribe el autor (p. ej. "2023 - 2025")
 */
public record CareerMilestoneDomain(
        String period,
        String title,
        String role,
        String organization,
        List<String> technologies,
        String summary
) {

    public CareerMilestoneDomain {
        technologies = technologies == null ? List.of() : List.copyOf(technologies);
    }
}
