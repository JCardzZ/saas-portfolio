package dev.portfolio.domain.model;

import java.util.List;

/**
 * Lo que responde el copiloto de arquitectura: una respuesta breve y recomendaciones con sus
 * contrapartidas. Lo redacta un modelo, así que antes de llegar aquí pasa por
 * {@code ArchitectureAdviceSanitizer}: nada de lo que contiene es de fiar sin ese filtro.
 */
public record ArchitectureAdviceDomain(String answer, List<Recommendation> recommendations) {

    public ArchitectureAdviceDomain {
        recommendations = recommendations == null ? List.of() : List.copyOf(recommendations);
    }

    /**
     * @param snippetLanguage lenguaje del fragmento de ejemplo; {@code null} si no hay fragmento
     * @param additions       piezas que la recomendación añadiría al lienzo
     */
    public record Recommendation(String title, List<String> pros, List<String> cons,
                                 String snippetLanguage, String snippet, List<Addition> additions) {
    }

    /**
     * @param code        código del catálogo de servicios, o {@link #CUSTOM} para una tecnología que no está en él
     * @param name        nombre de la tecnología cuando es {@link #CUSTOM}
     * @param connectFrom id del nodo existente desde el que se conectaría; puede faltar
     */
    public record Addition(String code, String name, String role, String connectFrom) {
        public static final String CUSTOM = "custom";
    }
}
