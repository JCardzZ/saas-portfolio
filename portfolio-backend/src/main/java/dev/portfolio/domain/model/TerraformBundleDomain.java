package dev.portfolio.domain.model;

/** Esqueleto de Terraform de una topología: recursos y dependencias, sin argumentos. */
public record TerraformBundleDomain(String mainTf, String variablesTf) {
}
