# main.tf — esqueleto generado desde el lienzo (AWS)
# Ilustrativo: faltan los argumentos de cada recurso; no se puede aplicar tal cual.

terraform {
  required_providers {
    aws = { source = "hashicorp/aws" }
    cloudflare = { source = "cloudflare/cloudflare" }
    elasticstack = { source = "elastic/elasticstack" }
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
  depends_on = [aws_cloudfront_distribution.static, aws_lb.lb]
}

resource "aws_cloudfront_distribution" "static" {
  # S3 + CloudFront · Tienda (frontend)
}

resource "aws_lb" "lb" {
  # Application LB · Balanceador
  depends_on = [aws_ecs_service.api, aws_ecs_service.queries]
}

resource "aws_ecs_service" "api" {
  # ECS Fargate · Comandos · escritura
  depends_on = [aws_rds_cluster.event_store, aws_msk_cluster.events]
}

resource "aws_ecs_service" "queries" {
  # ECS Fargate · Consultas · lectura
  depends_on = [elasticstack_elasticsearch_index.read_model, aws_elasticache_replication_group.redis]
}

resource "aws_msk_cluster" "events" {
  # MSK (Kafka) · Bus de eventos
  depends_on = [aws_ecs_service.queries]
}

resource "aws_rds_cluster" "event_store" {
  # Aurora PostgreSQL · Almacén de eventos
  depends_on = [aws_rds_cluster.replica]
}

resource "elasticstack_elasticsearch_index" "read_model" {
  # Elasticsearch · Modelo de lectura
}

resource "aws_elasticache_replication_group" "redis" {
  # ElastiCache · Caché de consultas
}

resource "aws_rds_cluster" "replica" {
  # Aurora PostgreSQL · Réplica de lectura
}

resource "aws_secretsmanager_secret" "secrets" {
  # Secrets Manager · Secretos
}

resource "aws_cloudwatch_log_group" "observability" {
  # CloudWatch · Logs y métricas
}

# Fuera de Terraform: Visitantes