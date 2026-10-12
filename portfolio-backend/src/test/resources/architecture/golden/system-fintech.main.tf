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
  depends_on = [aws_wafv2_web_acl.waf]
}

resource "aws_wafv2_web_acl" "waf" {
  # WAF · Cortafuegos de aplicación
  depends_on = [aws_apigatewayv2_api.gateway]
}

resource "aws_apigatewayv2_api" "gateway" {
  # Amazon API Gateway · Entrada de las APIs
  depends_on = [aws_lb.lb]
}

resource "aws_lb" "lb" {
  # Application LB · Balanceador
  depends_on = [aws_ecs_service.api]
}

resource "aws_ecs_service" "api" {
  # ECS Fargate · API de pagos
  depends_on = [aws_db_instance.postgres, aws_elasticache_replication_group.redis, aws_sqs_queue.queue, aws_sns_topic.push, aws_cognito_user_pool.identity, aws_secretsmanager_secret.secrets, aws_cloudwatch_log_group.observability]
}

resource "aws_db_instance" "postgres" {
  # RDS PostgreSQL · Movimientos y saldos
  depends_on = [aws_db_instance.postgres_standby]
}

resource "aws_db_instance" "postgres_standby" {
  # RDS PostgreSQL · Réplica en otra zona
}

resource "aws_elasticache_replication_group" "redis" {
  # ElastiCache · Límites y sesiones
}

resource "aws_sqs_queue" "queue" {
  # SQS · Avisos y conciliación
}

resource "aws_sns_topic" "push" {
  # SNS · Notificaciones push
}

resource "aws_cognito_user_pool" "identity" {
  # Cognito · Inicio de sesión
}

resource "aws_secretsmanager_secret" "secrets" {
  # Secrets Manager · Secretos
}

resource "aws_cloudwatch_log_group" "observability" {
  # CloudWatch · Logs y métricas
}

# Fuera de Terraform: Visitantes