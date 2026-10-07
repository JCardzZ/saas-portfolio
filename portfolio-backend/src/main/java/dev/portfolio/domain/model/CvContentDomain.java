package dev.portfolio.domain.model;

import java.util.List;

/**
 * Contenido de un CV, independiente de cómo se maquete.
 *
 * @param name     nombre de la persona
 * @param headline titular profesional; puede ir vacío
 * @param sections secciones en el orden en que se imprimen
 */
public record CvContentDomain(String name, String headline, List<Section> sections) {

    public CvContentDomain {
        sections = List.copyOf(sections);
    }

    /**
     * @param aside la sección es un dato de apoyo (formación, idiomas): en las maquetas a dos
     *              columnas va en la barra lateral
     */
    public record Section(String title, List<Block> blocks, boolean aside) {
        public Section {
            blocks = List.copyOf(blocks);
        }
    }

    /** El texto puede llevar negrita marcada con {@code **}, como en Markdown. */
    public record Block(Kind kind, String text) {
    }

    public enum Kind {
        /** Título de una entrada dentro de la sección (un puesto, un proyecto). */
        HEADING,
        PARAGRAPH,
        BULLET
    }
}
