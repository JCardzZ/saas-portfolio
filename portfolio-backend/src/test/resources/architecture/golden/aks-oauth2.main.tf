# main.tf — esqueleto generado desde el lienzo (Azure)
# Ilustrativo: faltan los argumentos de cada recurso; no se puede aplicar tal cual.

terraform {
  required_providers {
    azuread = { source = "hashicorp/azuread" }
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
  depends_on = [azurerm_api_management.apim]
}

resource "azurerm_api_management" "apim" {
  # API Management · Entrada de las APIs · OAuth2
  # puertos: 443
  depends_on = [azurerm_kubernetes_cluster.aks, azuread_application.identity]
}

resource "azurerm_kubernetes_cluster" "aks" {
  # AKS · Microservicios Spring Boot
  # capacidad: var.aks_instance
  # puertos: 8080
  depends_on = [azurerm_postgresql_flexible_server.postgres, azurerm_redis_cache.redis]
}

resource "azurerm_postgresql_flexible_server" "postgres" {
  # PostgreSQL Flexible · PostgreSQL + pgvector
}

resource "azurerm_redis_cache" "redis" {
  # Cache for Redis · Redis
}

resource "azuread_application" "identity" {
  # Entra External ID · Emisor de tokens OAuth2 / JWT
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

# Fuera de Terraform: Visitantes