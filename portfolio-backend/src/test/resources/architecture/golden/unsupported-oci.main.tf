# main.tf — esqueleto generado desde el lienzo (OCI)
# Ilustrativo: faltan los argumentos de cada recurso; no se puede aplicar tal cual.

terraform {
  required_providers {
    cloudflare = { source = "cloudflare/cloudflare" }
    oci = { source = "oracle/oci" }
    snowflake = { source = "snowflakedb/snowflake" }
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
  depends_on = [oci_container_instances_container_instance.api]
}

resource "oci_container_instances_container_instance" "api" {
  # Container Instances · API Spring Boot
  depends_on = [oci_psql_db_system.postgres]
}

resource "oci_psql_db_system" "postgres" {
  # OCI Database with PostgreSQL · OLTP · transaccional
  depends_on = [oci_golden_gate_deployment.cdc]
}

resource "oci_golden_gate_deployment" "cdc" {
  # GoldenGate · Captura de cambios
  depends_on = [oci_database_autonomous_database.warehouse, snowflake_database.snowflake_1]
}

resource "oci_database_autonomous_database" "warehouse" {
  # Autonomous AI Lakehouse · Almacén de datos
}

resource "oci_vault_secret" "secrets" {
  # Vault · Secretos
}

resource "snowflake_database" "snowflake_1" {
  # Snowflake · Pieza de datos
}

# Debezium: sin soporte de Terraform todavía
# Panel de "ventas": sin soporte de Terraform todavía

# Fuera de Terraform: Visitantes, AS400