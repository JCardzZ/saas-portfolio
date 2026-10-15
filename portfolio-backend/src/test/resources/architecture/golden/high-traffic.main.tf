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
  # Cloudflare · Anti-DDoS · CDN · DNS
  depends_on = [aws_cloudfront_distribution.static, aws_wafv2_web_acl.waf]
}

resource "aws_cloudfront_distribution" "static" {
  # S3 + CloudFront · Frontend Angular
}

resource "aws_wafv2_web_acl" "waf" {
  # WAF · Cortafuegos de aplicación
  depends_on = [aws_lb.lb]
}

resource "aws_lb" "lb" {
  # Application LB · Balanceador
  depends_on = [aws_ecs_service.api, aws_ecs_service.api_2]
}

resource "aws_ecs_service" "api" {
  # ECS Fargate · API pública
  # capacidad: var.api_instance
  # puertos: 8080
  depends_on = [aws_db_instance.postgres, aws_elasticache_replication_group.redis, aws_sqs_queue.queue]
}

resource "aws_ecs_service" "api_2" {
  # ECS Fargate · API pública
  depends_on = [aws_db_instance.postgres]
}

resource "aws_db_instance" "postgres" {
  # RDS PostgreSQL · PostgreSQL + pgvector
  depends_on = [aws_db_instance.postgres_standby]
}

resource "aws_db_instance" "postgres_standby" {
  # RDS PostgreSQL · En espera en otra zona
  # nombre: RDS · réplica Multi-AZ
}

resource "aws_elasticache_replication_group" "redis" {
  # ElastiCache · Redis
}

resource "aws_sqs_queue" "queue" {
  # SQS · Procesamiento asíncrono
}

resource "aws_cloudwatch_log_group" "observability" {
  # CloudWatch · Logs y métricas
}

resource "aws_secretsmanager_secret" "secrets" {
  # Secrets Manager · Secretos
}

# Fuera de Terraform: Visitantes