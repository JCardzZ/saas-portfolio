# main.tf — esqueleto generado desde el lienzo (GCP)
# Ilustrativo: faltan los argumentos de cada recurso; no se puede aplicar tal cual.

terraform {
  required_providers {
    cloudflare = { source = "cloudflare/cloudflare" }
    google = { source = "hashicorp/google" }
    mongodbatlas = { source = "mongodb/mongodbatlas" }
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
  depends_on = [google_compute_global_forwarding_rule.lb, google_storage_bucket.static]
}

resource "google_storage_bucket" "static" {
  # Cloud Storage + CDN · Frontend Angular
}

resource "google_compute_global_forwarding_rule" "lb" {
  # Cloud Load Balancing · Balanceador
  depends_on = [google_cloud_run_v2_service.api]
}

resource "google_cloud_run_v2_service" "api" {
  # Cloud Run · API GraphQL
  depends_on = [mongodbatlas_advanced_cluster.courses, google_pubsub_topic.notices, google_identity_platform_config.identity, google_storage_bucket.bucket, google_secret_manager_secret.secrets, google_monitoring_alert_policy.observability]
}

resource "mongodbatlas_advanced_cluster" "courses" {
  # MongoDB Atlas · Cursos y entregas
}

resource "google_pubsub_topic" "notices" {
  # Pub/Sub · Avisos
}

resource "google_identity_platform_config" "identity" {
  # Identity Platform · Alumnos y docentes
}

resource "google_storage_bucket" "bucket" {
  # Cloud Storage · Material y entregas
}

resource "google_secret_manager_secret" "secrets" {
  # Secret Manager · Secretos
}

resource "google_monitoring_alert_policy" "observability" {
  # Cloud Monitoring · Logs y métricas
}

# Fuera de Terraform: Visitantes