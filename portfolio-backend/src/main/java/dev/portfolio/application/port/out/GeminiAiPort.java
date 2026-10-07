package dev.portfolio.application.port.out;

import dev.portfolio.domain.model.ArchitectureAdviceDomain;
import dev.portfolio.domain.model.EmbeddingDomain;

import java.util.List;

/**
 * Los vectores devueltos tienen {@link EmbeddingDomain#DIMENSIONS} dimensiones.
 * Consultas y documentos se embeben por separado porque el modelo los optimiza de forma distinta.
 */
public interface GeminiAiPort {

    float[] embedQuery(String text);

    /** @return un vector por texto, en el mismo orden */
    List<float[]> embedDocuments(List<String> texts);

    /** Genera la respuesta a {@code prompt} apoyándose únicamente en {@code context}. */
    String generateAnswer(String prompt, List<EmbeddingDomain> context);

    /**
     * Pide al modelo recomendaciones sobre una topología.
     *
     * @param topology descripción en texto de los nodos y conexiones del lienzo
     * @param catalog  líneas {@code código: nombre} de las piezas que el modelo puede proponer
     * @param context  fragmentos indexados relacionados con la pregunta; puede ir vacío
     * @return lo que haya respondido el modelo, SIN filtrar: quien lo llama debe sanearlo
     */
    ArchitectureAdviceDomain adviseArchitecture(String question, String topology, List<String> catalog, List<EmbeddingDomain> context);
}
