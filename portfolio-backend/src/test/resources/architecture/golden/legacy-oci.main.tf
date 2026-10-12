# main.tf — esqueleto generado desde el lienzo (OCI)
# Ilustrativo: faltan los argumentos de cada recurso; no se puede aplicar tal cual.

terraform {
  required_providers {
    cloudflare = { source = "cloudflare/cloudflare" }
    oci = { source = "oracle/oci" }
  }
}

provider "oci" {
  region = var.region
}

resource "oci_core_vcn" "main" {
  # VCN · red privada con subred pública y subredes privadas
}

resource "cloudflare_record" "edge" {
  # Cloudflare · CDN · WAF · DNS
  depends_on = [oci_load_balancer_load_balancer.lb]
}

resource "oci_load_balancer_load_balancer" "lb" {
  # Load Balancer · Balanceador
}

resource "oci_psql_db_system" "postgres" {
  # OCI Database with PostgreSQL · PostgreSQL + pgvector
}

resource "oci_vault_secret" "secrets" {
  # Vault · Secretos
}

resource "oci_artifacts_container_repository" "registry" {
  # Container Registry · Registro de imágenes
}

# Frontend Angular: sin recurso de Terraform equivalente en OCI
# API Spring Boot: sin recurso de Terraform equivalente en OCI
# Redis: sin recurso de Terraform equivalente en OCI
# Logs y métricas: sin recurso de Terraform equivalente en OCI

# Fuera de Terraform: Visitantes, Gemini API, Terraform + Docker