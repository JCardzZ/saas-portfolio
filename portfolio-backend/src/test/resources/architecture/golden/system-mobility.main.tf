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
  depends_on = [aws_ecs_service.bff]
}

resource "aws_ecs_service" "bff" {
  # ECS Fargate · BFF de la app
  depends_on = [aws_eks_cluster.cluster]
}

resource "aws_eks_cluster" "cluster" {
  # EKS · Viajes y emparejamiento
  depends_on = [aws_dynamodb_table.trips, aws_elasticache_replication_group.redis, aws_msk_cluster.positions, aws_sns_topic.push, aws_secretsmanager_secret.secrets, aws_cloudwatch_log_group.observability]
}

resource "aws_dynamodb_table" "trips" {
  # DynamoDB · Viajes y conductores
}

resource "aws_elasticache_replication_group" "redis" {
  # ElastiCache · Estado en vivo
}

resource "aws_msk_cluster" "positions" {
  # MSK (Kafka) · Posiciones
}

resource "aws_sns_topic" "push" {
  # SNS · Notificaciones push
}

resource "aws_secretsmanager_secret" "secrets" {
  # Secrets Manager · Secretos
}

resource "aws_cloudwatch_log_group" "observability" {
  # CloudWatch · Logs y métricas
}

# Fuera de Terraform: Visitantes