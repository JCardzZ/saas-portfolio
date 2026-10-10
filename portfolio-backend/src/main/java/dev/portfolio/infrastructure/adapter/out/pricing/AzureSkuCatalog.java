package dev.portfolio.infrastructure.adapter.out.pricing;

import dev.portfolio.domain.model.pricing.PricingUnit;

import java.util.Map;
import java.util.Optional;

/**
 * Qué SKU de Azure representa a cada servicio del catálogo del Estudio. Es una tabla cerrada:
 * lo que se consulta a la API de Azure sale de aquí y nunca de lo que envía un visitante.
 * Cada fila identifica un único medidor (servicio, producto, SKU y medidor exactos) y dice qué
 * cubre, porque un precio por hora de cómputo no es el coste de un servicio entero.
 *
 * Comprobadas contra la API el 2026-10-10. Un servicio que no está aquí no tiene tarifa
 * asignada y se cotiza como «precio desconocido»: no se aproxima con otro.
 */
final class AzureSkuCatalog {

    /**
     * @param sku         nombre corto que se muestra
     * @param serviceName {@code serviceName} en la API
     * @param productName {@code productName} en la API
     * @param skuName     {@code skuName} en la API
     * @param meterName   {@code meterName} en la API
     * @param unitOfMeasure unidad que debe declarar la API para que el precio se acepte
     * @param note        qué cubre el precio
     */
    record AzureSku(String sku, String serviceName, String productName, String skuName, String meterName,
                    String unitOfMeasure, PricingUnit unit, String note) {
    }

    private static final String HOUR = "1 Hour";

    private static final Map<String, AzureSku> BY_SERVICE = Map.of(
            "vm", new AzureSku("D2s_v5", "Virtual Machines", "Virtual Machines Dsv5 Series", "Standard_D2s_v5", "D2s v5",
                    HOUR, PricingUnit.HOURLY, "Una máquina D2s v5 con Linux (2 vCPU, 8 GB). No incluye disco ni tráfico de salida."),
            "kubernetes", new AzureSku("AKS Standard", "Azure Kubernetes Service", "Azure Kubernetes Service", "Standard", "Standard Uptime SLA",
                    HOUR, PricingUnit.HOURLY, "Solo el plano de control de AKS (nivel Standard). Los nodos se pagan aparte, como máquinas virtuales."),
            "postgres", new AzureSku("PostgreSQL B1MS", "Azure Database for PostgreSQL",
                    "Azure Database for PostgreSQL Flexible Server Burstable BS Series Compute", "B1MS", "B1MS",
                    HOUR, PricingUnit.HOURLY, "Cómputo de un servidor flexible B1MS (1 vCore). No incluye almacenamiento ni copias."),
            "newsql-pg", new AzureSku("PostgreSQL D2ds_v5", "Azure Database for PostgreSQL",
                    "Azure Database for PostgreSQL Flexible Server General Purpose Ddsv5 Series Compute", "2 vCore", "vCore",
                    HOUR, PricingUnit.HOURLY, "Cómputo de un nodo D2ds v5 (2 vCore). Un clúster elástico tiene varios; no incluye almacenamiento."),
            "redis", new AzureSku("Redis Basic C1", "Redis Cache", "Azure Redis Cache Basic", "C1", "C1 Cache",
                    HOUR, PricingUnit.HOURLY, "Una caché Basic C1 (1 GB), sin réplica."),
            "event-stream", new AzureSku("Event Hubs Standard TU", "Event Hubs", "Event Hubs", "Standard", "Standard Throughput Unit",
                    HOUR, PricingUnit.HOURLY, "Una unidad de rendimiento del nivel Standard. Los eventos de entrada se pagan aparte, por millón."),
            "streaming", new AzureSku("Event Hubs Standard TU", "Event Hubs", "Event Hubs", "Standard", "Standard Throughput Unit",
                    HOUR, PricingUnit.HOURLY, "Una unidad de rendimiento del nivel Standard. Los eventos de entrada se pagan aparte, por millón."));

    private AzureSkuCatalog() {
    }

    static Optional<AzureSku> find(String serviceCode) {
        return Optional.ofNullable(BY_SERVICE.get(serviceCode));
    }
}
