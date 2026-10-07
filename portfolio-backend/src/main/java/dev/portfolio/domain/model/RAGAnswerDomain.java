package dev.portfolio.domain.model;

import java.util.List;

public record RAGAnswerDomain(String answer, List<Citation> citations) {

    public RAGAnswerDomain {
        citations = citations == null ? List.of() : List.copyOf(citations);
    }

    /** Fragmento en el que se apoya la respuesta. */
    public record Citation(String filePath, String lineNumberRange, String codeSnippet) {
    }
}
