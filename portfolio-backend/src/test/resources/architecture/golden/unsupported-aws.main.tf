# main.tf — esqueleto generado desde el lienzo (AWS)
# Ilustrativo: faltan los argumentos de cada recurso; no se puede aplicar tal cual.

terraform {
  required_providers {
    aws = { source = "hashicorp/aws" }
    cloudflare = { source = "cloudflare/cloudflare" }
    snowflake = { source = "snowflakedb/snowflake" }
  }
}

provider "aws" {
  region = var.region
}

resource "aws_vpc" "main" {
  # VPC · red privada con subred pública y subredes privadas
}

resource "cloudflare_record" "edge" {
  # Cloudflare · CDN · WAF · DNS
  depends_on = [aws_lb.lb]
}

resource "aws_lb" "lb" {
  # Application LB · Balanceador
  depends_on = [aws_ecs_service.api]
}

resource "aws_ecs_service" "api" {
  # ECS Fargate · API Spring Boot
  depends_on = [aws_db_instance.postgres]
}

resource "aws_db_instance" "postgres" {
  # RDS PostgreSQL · OLTP · transaccional
  depends_on = [aws_dms_replication_task.cdc]
}

resource "aws_dms_replication_task" "cdc" {
  # Database Migration Service · Captura de cambios
  depends_on = [aws_redshift_cluster.warehouse, snowflake_database.snowflake_1]
}

resource "aws_redshift_cluster" "warehouse" {
  # Redshift · Almacén de datos
}

resource "aws_secretsmanager_secret" "secrets" {
  # Secrets Manager · Secretos
}

resource "snowflake_database" "snowflake_1" {
  # Snowflake · Pieza de datos
}

# Debezium: sin soporte de Terraform todavía
# Panel de "ventas": sin soporte de Terraform todavía

# Fuera de Terraform: Visitantes, Mainframe