# main.tf — esqueleto generado desde el lienzo (Azure)
# Ilustrativo: faltan los argumentos de cada recurso; no se puede aplicar tal cual.

terraform {
  required_providers {
    azurerm = { source = "hashicorp/azurerm" }
    cloudflare = { source = "cloudflare/cloudflare" }
    snowflake = { source = "snowflakedb/snowflake" }
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
  depends_on = [azurerm_application_gateway.lb]
}

resource "azurerm_application_gateway" "lb" {
  # Application Gateway · Balanceador
  depends_on = [azurerm_container_app.api]
}

resource "azurerm_container_app" "api" {
  # Container Apps · API Spring Boot
  depends_on = [azurerm_postgresql_flexible_server.postgres]
}

resource "azurerm_postgresql_flexible_server" "postgres" {
  # PostgreSQL Flexible · OLTP · transaccional
  depends_on = [azurerm_data_factory.cdc]
}

resource "azurerm_data_factory" "cdc" {
  # Data Factory (CDC) · Captura de cambios
  depends_on = [azurerm_synapse_workspace.warehouse, snowflake_database.snowflake_1]
}

resource "azurerm_synapse_workspace" "warehouse" {
  # Synapse Analytics · Almacén de datos
}

resource "azurerm_key_vault" "secrets" {
  # Key Vault · Secretos
}

resource "snowflake_database" "snowflake_1" {
  # Snowflake · Pieza de datos
}

# Debezium: sin soporte de Terraform todavía
# Panel de "ventas": sin soporte de Terraform todavía

# Fuera de Terraform: Visitantes, AS400