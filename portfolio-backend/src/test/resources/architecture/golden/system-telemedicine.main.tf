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
  depends_on = [azurerm_application_gateway.lb, azurerm_cdn_frontdoor_profile.static]
}

resource "azurerm_cdn_frontdoor_profile" "static" {
  # Storage + Front Door · Frontend Angular
}

resource "azurerm_application_gateway" "lb" {
  # Application Gateway · Balanceador
  depends_on = [azurerm_container_app.api]
}

resource "azurerm_container_app" "api" {
  # Container Apps · API de citas y salas
  depends_on = [azurerm_postgresql_flexible_server.postgres, azurerm_servicebus_queue.queue, azuread_application.identity, azurerm_key_vault.secrets, azurerm_log_analytics_workspace.observability]
}

resource "azurerm_postgresql_flexible_server" "postgres" {
  # PostgreSQL Flexible · Historiales y citas
  depends_on = [azurerm_postgresql_flexible_server.postgres_standby]
}

resource "azurerm_postgresql_flexible_server" "postgres_standby" {
  # PostgreSQL Flexible · Réplica en otra zona
}

resource "azurerm_servicebus_queue" "queue" {
  # Service Bus · Recordatorios
}

resource "azuread_application" "identity" {
  # Entra External ID · Pacientes y médicos
}

resource "azurerm_key_vault" "secrets" {
  # Key Vault · Secretos
}

resource "azurerm_log_analytics_workspace" "observability" {
  # Azure Monitor · Logs y métricas
}

# Fuera de Terraform: Visitantes