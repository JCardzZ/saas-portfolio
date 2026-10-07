# main.tf — esqueleto generado desde el lienzo (Azure)
# Ilustrativo: faltan los argumentos de cada recurso; no se puede aplicar tal cual.

terraform {
  required_providers {
    azurerm = { source = "hashicorp/azurerm" }
    cloudflare = { source = "cloudflare/cloudflare" }
  }
}

provider "azurerm" {
  features {}
}

resource "azurerm_virtual_network" "main" {
  # VNet · red privada con subred pública y subredes privadas
}

resource "cloudflare_record" "edge" {
  # Cloudflare · CDN · WAF · DNS
  depends_on = [azurerm_cdn_frontdoor_profile.static, azurerm_application_gateway.lb]
}

resource "azurerm_cdn_frontdoor_profile" "static" {
  # Storage + Front Door · Frontend Angular
}

resource "azurerm_application_gateway" "lb" {
  # Application Gateway · Balanceador
  depends_on = [azurerm_container_app.api]
}

resource "azurerm_container_app" "api" {
  # Container Apps · API Spring Boot
  # nombre: API de "pagos"
  # capacidad: var.api_instance
  # puertos: 8080, 443
  # entorno: var.api_env (SPRING_PROFILES_ACTIVE, JWT_SECRET, RUTA, VACIA)
  depends_on = [azurerm_postgresql_flexible_server.postgres, azurerm_redis_cache.redis]
}

resource "azurerm_postgresql_flexible_server" "postgres" {
  # PostgreSQL Flexible · PostgreSQL + pgvector
}

resource "azurerm_redis_cache" "redis" {
  # Cache for Redis · Redis
}

resource "azurerm_key_vault" "secrets" {
  # Key Vault · Secretos
}

resource "azurerm_log_analytics_workspace" "observability" {
  # Azure Monitor · Logs y métricas
}

resource "azurerm_container_registry" "registry" {
  # Container Registry · Registro de imágenes
}

# Fuera de Terraform: Visitantes, Gemini API, Terraform + Docker