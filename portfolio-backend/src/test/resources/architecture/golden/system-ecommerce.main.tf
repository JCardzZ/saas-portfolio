# main.tf — esqueleto generado desde el lienzo (GCP)
# Ilustrativo: faltan los argumentos de cada recurso; no se puede aplicar tal cual.

terraform {
  required_providers {
    cloudflare = { source = "cloudflare/cloudflare" }
    elasticstack = { source = "elastic/elasticstack" }
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
  depends_on = [google_compute_global_forwarding_rule.lb]
}

resource "google_compute_global_forwarding_rule" "lb" {
  # Cloud Load Balancing · Balanceador
  depends_on = [google_cloud_run_v2_service.web]
}

resource "google_cloud_run_v2_service" "web" {
  # Cloud Run · Web con render en servidor
  depends_on = [google_cloud_run_v2_service.api, google_storage_bucket.bucket]
}

resource "google_cloud_run_v2_service" "api" {
  # Cloud Run · API de pedidos
  depends_on = [google_sql_database_instance.postgres, elasticstack_elasticsearch_index.search, google_pubsub_subscription.queue, google_identity_platform_config.identity, google_secret_manager_secret.secrets, google_monitoring_alert_policy.observability]
}

resource "google_sql_database_instance" "postgres" {
  # Cloud SQL · Pedidos y clientes
  depends_on = [google_sql_database_instance.postgres_standby]
}

resource "google_sql_database_instance" "postgres_standby" {
  # Cloud SQL · Réplica en otra zona
}

resource "elasticstack_elasticsearch_index" "search" {
  # Elasticsearch · Búsqueda del catálogo
}

resource "google_pubsub_subscription" "queue" {
  # Pub/Sub · Stock y correo
}

resource "google_identity_platform_config" "identity" {
  # Identity Platform · Cuentas de cliente
}

resource "google_storage_bucket" "bucket" {
  # Cloud Storage · Imágenes de producto
}

resource "google_secret_manager_secret" "secrets" {
  # Secret Manager · Secretos
}

resource "google_monitoring_alert_policy" "observability" {
  # Cloud Monitoring · Logs y métricas
}

# Fuera de Terraform: Visitantes