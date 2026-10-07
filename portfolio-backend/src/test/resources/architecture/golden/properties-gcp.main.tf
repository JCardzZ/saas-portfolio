# main.tf — esqueleto generado desde el lienzo (GCP)
# Ilustrativo: faltan los argumentos de cada recurso; no se puede aplicar tal cual.

terraform {
  required_providers {
    cloudflare = { source = "cloudflare/cloudflare" }
    google = { source = "hashicorp/google" }
  }
}

provider "google" {
  project = var.project
  region  = var.region
}

resource "google_compute_network" "main" {
  # VPC · red privada con subred pública y subredes privadas
}

resource "cloudflare_record" "edge" {
  # Cloudflare · CDN · WAF · DNS
  depends_on = [google_storage_bucket.static, google_compute_global_forwarding_rule.lb]
}

resource "google_storage_bucket" "static" {
  # Cloud Storage + CDN · Frontend Angular
}

resource "google_compute_global_forwarding_rule" "lb" {
  # Cloud Load Balancing · Balanceador
  depends_on = [google_cloud_run_v2_service.api]
}

resource "google_cloud_run_v2_service" "api" {
  # Cloud Run · API Spring Boot
  # nombre: API de "pagos"
  # capacidad: var.api_instance
  # puertos: 8080, 443
  # entorno: var.api_env (SPRING_PROFILES_ACTIVE, JWT_SECRET, RUTA, VACIA)
  depends_on = [google_sql_database_instance.postgres, google_redis_instance.redis]
}

resource "google_sql_database_instance" "postgres" {
  # Cloud SQL · PostgreSQL + pgvector
}

resource "google_redis_instance" "redis" {
  # Memorystore · Redis
}

resource "google_secret_manager_secret" "secrets" {
  # Secret Manager · Secretos
}

resource "google_monitoring_alert_policy" "observability" {
  # Cloud Monitoring · Logs y métricas
}

resource "google_artifact_registry_repository" "registry" {
  # Artifact Registry · Registro de imágenes
}

# Fuera de Terraform: Visitantes, Gemini API, Terraform + Docker