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
  depends_on = [azurerm_application_gateway.lb, azurerm_cdn_frontdoor_profile.static]
}

resource "azurerm_cdn_frontdoor_profile" "static" {
  # Storage + Front Door · Frontend Angular
}

resource "azurerm_application_gateway" "lb" {
  # Application Gateway · Balanceador
  depends_on = [azurerm_container_app.api, azurerm_linux_function_app.ingest]
}

resource "azurerm_linux_function_app" "ingest" {
  # Functions · Ingesta de lecturas
  depends_on = [azurerm_eventhub.readings]
}

resource "azurerm_container_app" "api" {
  # Container Apps · API del panel
  depends_on = [azurerm_cosmosdb_account.devices, azurerm_redis_cache.redis, azurerm_key_vault.secrets, azurerm_log_analytics_workspace.observability]
}

resource "azurerm_cosmosdb_account" "devices" {
  # Cosmos DB · Dispositivos y última lectura
}

resource "azurerm_redis_cache" "redis" {
  # Cache for Redis · Último estado
}

resource "azurerm_eventhub" "readings" {
  # Event Hubs · Lecturas
  depends_on = [azurerm_stream_analytics_job.aggregate]
}

resource "azurerm_stream_analytics_job" "aggregate" {
  # Stream Analytics · Agregados por minuto
  depends_on = [azurerm_synapse_workspace.history, azurerm_cosmosdb_account.devices]
}

resource "azurerm_synapse_workspace" "history" {
  # Synapse Analytics · Histórico
}

resource "azurerm_key_vault" "secrets" {
  # Key Vault · Secretos
}

resource "azurerm_log_analytics_workspace" "observability" {
  # Azure Monitor · Logs y métricas
}

# Fuera de Terraform: Visitantes