# main.tf — esqueleto generado desde el lienzo (AWS)
# Ilustrativo: faltan los argumentos de cada recurso; no se puede aplicar tal cual.

terraform {
  required_providers {
    aws = { source = "hashicorp/aws" }
    cloudflare = { source = "cloudflare/cloudflare" }
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
  depends_on = [aws_ecs_service.api, aws_ecs_service.payments]
}

resource "aws_ecs_service" "api" {
  # ECS Fargate · Servicio de pedidos
  depends_on = [aws_db_instance.postgres, aws_kinesis_stream.events]
}

resource "aws_ecs_service" "payments" {
  # ECS Fargate · Servicio de pagos
  depends_on = [aws_db_instance.postgres, aws_kinesis_stream.events]
}

resource "aws_db_instance" "postgres" {
  # RDS PostgreSQL · PostgreSQL + pgvector
}

resource "aws_kinesis_stream" "events" {
  # Kinesis Data Streams · Stream de eventos
  depends_on = [aws_kinesisanalyticsv2_application.processing]
}

resource "aws_kinesisanalyticsv2_application" "processing" {
  # Managed Flink · Agregación en ventanas
  depends_on = [aws_redshift_cluster.warehouse]
}

resource "aws_redshift_cluster" "warehouse" {
  # Redshift · Almacén de datos
  depends_on = [aws_quicksight_data_source.dashboards]
}

resource "aws_quicksight_data_source" "dashboards" {
  # Amazon Quick Sight · Paneles de negocio
}

resource "aws_secretsmanager_secret" "secrets" {
  # Secrets Manager · Secretos
}

# Fuera de Terraform: Visitantes