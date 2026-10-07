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
  # ECS Fargate · API Spring Boot
  # capacidad: var.api_instance
  # puertos: 8080
  # entorno: var.api_env (MQ_QUEUE_MANAGER, MQ_CHANNEL)
  depends_on = [aws_db_instance.postgres, aws_elasticache_replication_group.redis, aws_sqs_queue.queue]
}

resource "aws_ecs_service" "batch" {
  # ECS Fargate · Procesos por lotes
  # nombre: Spring Batch
  depends_on = [aws_db_instance.postgres]
}

resource "aws_lambda_function" "lambda" {
  # Lambda · Consume la cola y entrega al core
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

resource "aws_sqs_queue" "queue" {
  # SQS · Eventos pendientes de entregar
  depends_on = [aws_lambda_function.lambda]
}

# Fuera de Terraform: Visitantes, IBM MQ, IBM AS400