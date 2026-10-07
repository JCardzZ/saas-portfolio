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
  depends_on = [aws_cloudfront_distribution.static, aws_apigatewayv2_api.gateway]
}

resource "aws_cloudfront_distribution" "static" {
  # S3 + CloudFront · Micro-frontends
}

resource "aws_apigatewayv2_api" "gateway" {
  # Amazon API Gateway · Enruta por inquilino
  depends_on = [aws_ecs_service.api, aws_ecs_service.billing, aws_cognito_user_pool.identity]
}

resource "aws_ecs_service" "api" {
  # ECS Fargate · Servicio de cuentas
  depends_on = [aws_db_instance.postgres, aws_elasticache_replication_group.redis]
}

resource "aws_ecs_service" "billing" {
  # ECS Fargate · Servicio de facturación
  depends_on = [aws_db_instance.postgres, aws_sqs_queue.queue]
}

resource "aws_elasticache_replication_group" "redis" {
  # ElastiCache · Redis
}

resource "aws_db_instance" "postgres" {
  # RDS PostgreSQL · Un esquema por inquilino
}

resource "aws_cognito_user_pool" "identity" {
  # Cognito · Inquilinos y usuarios
}

resource "aws_sqs_queue" "queue" {
  # SQS · Facturas pendientes
}

resource "aws_secretsmanager_secret" "secrets" {
  # Secrets Manager · Secretos
}

resource "aws_cloudwatch_log_group" "observability" {
  # CloudWatch · Logs y métricas
}

# Fuera de Terraform: Visitantes