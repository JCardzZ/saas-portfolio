# main.tf — esqueleto generado desde el lienzo (AWS)
# Ilustrativo: faltan los argumentos de cada recurso; no se puede aplicar tal cual.

terraform {
  required_providers {
    aws = { source = "hashicorp/aws" }
    cloudflare = { source = "cloudflare/cloudflare" }
    vault = { source = "hashicorp/vault" }
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
  # Amazon API Gateway · mTLS y cuotas
  depends_on = [aws_ecs_service.api]
}

resource "aws_ecs_service" "api" {
  # ECS Fargate · API de pagos
  depends_on = [aws_elasticache_replication_group.redis, aws_db_instance.postgres, aws_msk_cluster.events, vault_mount.vault]
}

resource "aws_msk_cluster" "events" {
  # MSK (Kafka) · Eventos de pago
  depends_on = [aws_ecs_service.ledger]
}

resource "aws_ecs_service" "ledger" {
  # ECS Fargate · Libro mayor
  depends_on = [aws_db_instance.postgres, vault_mount.vault]
}

resource "aws_elasticache_replication_group" "redis" {
  # ElastiCache · Claves de idempotencia
}

resource "aws_db_instance" "postgres" {
  # RDS PostgreSQL · Transacciones ACID
}

resource "aws_cloudwatch_log_group" "observability" {
  # CloudWatch · Logs y métricas
}

resource "vault_mount" "vault" {
  # HashiCorp Vault · Credenciales dinámicas
}

# Fuera de Terraform: Visitantes