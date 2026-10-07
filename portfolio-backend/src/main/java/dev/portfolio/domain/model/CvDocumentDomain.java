package dev.portfolio.domain.model;

/** Un CV listo para descargar. */
public record CvDocumentDomain(String filename, byte[] content) {
}
