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
  depends_on = [oci_objectstorage_bucket.static, oci_load_balancer_load_balancer.lb]
}

resource "oci_objectstorage_bucket" "static" {
  # Object Storage · Frontend Angular
}

resource "oci_load_balancer_load_balancer" "lb" {
  # Load Balancer · Balanceador
  depends_on = [oci_container_instances_container_instance.api]
}

resource "oci_container_instances_container_instance" "api" {
  # Container Instances · API Spring Boot
  # nombre: API de "pagos"
  # capacidad: var.api_instance
  # puertos: 8080, 443
  # entorno: var.api_env (SPRING_PROFILES_ACTIVE, JWT_SECRET, RUTA, VACIA)
  depends_on = [oci_psql_db_system.postgres, oci_redis_redis_cluster.redis]
}

resource "oci_psql_db_system" "postgres" {
  # OCI Database with PostgreSQL · PostgreSQL + pgvector
}

resource "oci_redis_redis_cluster" "redis" {
  # OCI Cache · Redis
}

resource "oci_vault_secret" "secrets" {
  # Vault · Secretos
}

resource "oci_monitoring_alarm" "observability" {
  # Monitoring · Logs y métricas
}

resource "oci_artifacts_container_repository" "registry" {
  # Container Registry · Registro de imágenes
}

# Fuera de Terraform: Visitantes, Gemini API, Terraform + Docker