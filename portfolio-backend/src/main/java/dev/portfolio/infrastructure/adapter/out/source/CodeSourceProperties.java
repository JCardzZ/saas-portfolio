package dev.portfolio.infrastructure.adapter.out.source;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * @param codeRoot carpeta raíz del código a indexar; vacío desactiva la indexación de código
 */
@ConfigurationProperties(prefix = "ai.rag")
public record CodeSourceProperties(String codeRoot) {
}
