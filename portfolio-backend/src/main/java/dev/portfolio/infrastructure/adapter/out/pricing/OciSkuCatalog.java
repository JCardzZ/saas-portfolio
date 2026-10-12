package dev.portfolio.infrastructure.adapter.out.pricing;

import dev.portfolio.domain.model.pricing.PricingUnit;

import java.util.Map;
import java.util.Optional;

/**
 * Qué producto de la lista pública de precios de Oracle representa a cada servicio del catálogo
 * del Estudio. Es una tabla cerrada: el número de parte que se consulta sale de aquí y nunca de
 * lo que envía un visitante. Cada fila dice qué cubre, porque el precio por hora de una OCPU no
 * es el coste de un servicio entero.
 *
 * Comprobadas contra la API el 2026-10-11. Solo hay filas de precio único por hora: los productos
 * con tramo gratuito o que se facturan por petición no caben en «una unidad al mes». Un servicio
 * que no está aquí se cotiza como «precio desconocido»: no se aproxima con otro.
 */
final class OciSkuCatalog {

    /**
     * @param sku         nombre corto que se muestra
     * @param partNumber  número de parte en la lista de precios
     * @param displayName {@code displayName} que debe declarar la API para ese número de parte
     * @param metricName  unidad que debe declarar la API para que el precio se acepte
     * @param note        qué cubre el precio
     */
    record OciSku(String sku, String partNumber, String displayName, String metricName, PricingUnit unit, String note) {
    }

    private static final String OCPU_HOUR = "OCPU Per Hour";
    private static final OciSku POSTGRESQL = new OciSku("PostgreSQL OCPU", "B99060", "Database with PostgreSQL - X86", OCPU_HOUR, PricingUnit.HOURLY,
            "Una OCPU de un sistema de base de datos. No incluye el almacenamiento.");
    private static final OciSku LAKEHOUSE = new OciSku("Lakehouse ECPU", "B95701", "Oracle Autonomous AI Lakehouse - ECPU", "ECPU Per Hour", PricingUnit.HOURLY,
            "Una ECPU con licencia incluida. Una base de datos usa varias; no incluye el almacenamiento.");

    private static final Map<String, OciSku> BY_SERVICE = Map.of(
            "vm", new OciSku("Standard E5 OCPU", "B97384", "Compute - Standard - E5 - OCPU", OCPU_HOUR, PricingUnit.HOURLY,
                    "Una OCPU de una máquina Standard E5. La memoria se factura aparte; no incluye disco ni tráfico de salida."),
            "kubernetes", new OciSku("OKE Enhanced", "B96545", "OCI Kubernetes Engine - Enhanced Cluster", "Cluster Per Hour", PricingUnit.HOURLY,
                    "Solo el clúster (tipo Enhanced). Los nodos se pagan aparte, como máquinas virtuales."),
            "postgres", POSTGRESQL,
            "newsql-pg", POSTGRESQL,
            "streaming", new OciSku("Kafka OCPU", "B110500", "OCI Streaming With Apache Kafka", OCPU_HOUR, PricingUnit.HOURLY,
                    "Una OCPU de un clúster de Kafka. Un clúster usa varias; no incluye el almacenamiento."),
            "cdc", new OciSku("GoldenGate OCPU", "B92992", "OCI GoldenGate", OCPU_HOUR, PricingUnit.HOURLY,
                    "Una OCPU de un despliegue de GoldenGate, con licencia incluida."),
            "warehouse", LAKEHOUSE,
            "sql-query", LAKEHOUSE,
            "bi", new OciSku("Analytics Professional OCPU", "B89630", "Oracle Analytics Cloud - Professional - OCPU", OCPU_HOUR, PricingUnit.HOURLY,
                    "Una OCPU de una instancia de la edición Professional, con licencia incluida."));

    private OciSkuCatalog() {
    }

    static Optional<OciSku> find(String serviceCode) {
        return Optional.ofNullable(BY_SERVICE.get(serviceCode));
    }
}
