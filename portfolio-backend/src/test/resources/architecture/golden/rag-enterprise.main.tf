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
  # ECS Fargate · API RAG Spring Boot
  depends_on = [aws_db_instance.postgres, aws_elasticache_replication_group.redis, aws_bedrockagent_agent.llm, aws_sqs_queue.queue]
}

resource "aws_ecs_service" "ingest" {
  # ECS Fargate · Ingesta y troceo
  depends_on = [aws_s3_bucket.documents, aws_db_instance.postgres, aws_bedrockagent_agent.llm]
}

resource "aws_elasticache_replication_group" "redis" {
  # ElastiCache · Caché y límites
}

resource "aws_db_instance" "postgres" {
  # RDS PostgreSQL · pgvector · índice HNSW
}

resource "aws_bedrockagent_agent" "llm" {
  # Bedrock · Embeddings y respuestas
}

resource "aws_sqs_queue" "queue" {
  # SQS · Cola de ingesta
  depends_on = [aws_ecs_service.ingest]
}

resource "aws_s3_bucket" "documents" {
  # S3 · Documentos de origen
}

resource "aws_secretsmanager_secret" "secrets" {
  # Secrets Manager · Secretos
}

# Fuera de Terraform: Visitantes