package dev.portfolio.application.port.out;

import dev.portfolio.domain.model.SourceDocumentDomain;

import java.util.List;

public interface CodeSourcePort {

    /** @return los archivos de código indexables; vacío si no hay un origen de código configurado */
    List<SourceDocumentDomain> loadDocuments();
}
