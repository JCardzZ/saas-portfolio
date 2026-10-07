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
  depends_on = [aws_cloudfront_distribution.static, aws_lb.lb]
}

resource "aws_cloudfront_distribution" "static" {
  # S3 + CloudFront · Frontend Angular
}

resource "aws_lb" "lb" {
  # Application LB · Balanceador
  depends_on = [aws_ecs_service.api]
}

resource "aws_ecs_service" "api" {
  # ECS Fargate · API Spring Boot
  depends_on = [aws_db_instance.postgres, aws_elasticache_replication_group.redis]
}

resource "aws_db_instance" "postgres" {
  # RDS PostgreSQL · PostgreSQL + pgvector
}

resource "aws_elasticache_replication_group" "redis" {
  # ElastiCache · Redis
}

resource "aws_secretsmanager_secret" "secrets" {
  # Secrets Manager · Secretos
}

resource "aws_cloudwatch_log_group" "observability" {
  # CloudWatch · Logs y métricas
}

resource "aws_ecr_repository" "registry" {
  # ECR · Registro de imágenes
}

# Fuera de Terraform: Visitantes, Gemini API, Terraform + Docker