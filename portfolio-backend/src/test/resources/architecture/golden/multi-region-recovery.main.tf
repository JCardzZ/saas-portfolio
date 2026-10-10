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
  depends_on = [aws_lb.lb, aws_ecs_service.api_standby]
}

resource "aws_lb" "lb" {
  # Application LB · Balanceador
  depends_on = [aws_ecs_service.api]
}

resource "aws_ecs_service" "api" {
  # ECS Fargate · API Spring Boot
  depends_on = [aws_rds_global_cluster.primary]
}

resource "aws_rds_global_cluster" "primary" {
  # Aurora Global Database · Primaria · escrituras
  depends_on = [aws_rds_global_cluster.replica]
}

resource "aws_ecs_service" "api_standby" {
  # ECS Fargate · API en espera
  depends_on = [aws_rds_global_cluster.replica]
}

resource "aws_rds_global_cluster" "replica" {
  # Aurora Global Database · Réplica · otra región
}

resource "aws_secretsmanager_secret" "secrets" {
  # Secrets Manager · Secretos
}

# Fuera de Terraform: Visitantes