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
  depends_on = [aws_ecs_service.api]
}

resource "aws_ecs_service" "api" {
  # ECS Fargate · Productores (Cloud Stream)
  depends_on = [aws_msk_cluster.kafka]
}

resource "aws_msk_cluster" "kafka" {
  # MSK (Kafka) · Bus de eventos
  depends_on = [aws_ecs_service.consumers]
}

resource "aws_ecs_service" "consumers" {
  # ECS Fargate · Consumidores (Cloud Stream)
  depends_on = [aws_dynamodb_table.store]
}

resource "aws_dynamodb_table" "store" {
  # DynamoDB · Estado por clave
}

resource "aws_secretsmanager_secret" "secrets" {
  # Secrets Manager · Secretos
}

resource "aws_cloudwatch_log_group" "observability" {
  # CloudWatch · Logs y métricas
}

# Fuera de Terraform: Visitantes