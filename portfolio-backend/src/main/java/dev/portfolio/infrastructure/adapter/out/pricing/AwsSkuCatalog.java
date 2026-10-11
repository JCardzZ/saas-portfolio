package dev.portfolio.infrastructure.adapter.out.pricing;

import dev.portfolio.domain.model.pricing.PricingUnit;

import java.util.Map;
import java.util.Optional;

/**
 * Qué tarifa de AWS representa a cada servicio del catálogo del Estudio. Es una tabla cerrada:
 * el fichero que se descarga y la fila que se busca salen de aquí y nunca de lo que envía un
 * visitante. Cada fila identifica un único producto del fichero de precios de su servicio (por
 * {@code usagetype} y los atributos que lo distinguen) y dice qué cubre.
 *
 * Comprobadas contra los ficheros de us-east-1 el 2026-10-10. Los {@code usagetype} son de esa
 * región, por eso la región es parte de la tabla. Un servicio que no está aquí se cotiza como
 * «precio desconocido»: no se aproxima con otro. EC2 no está porque su fichero regional pesa
 * unos 460 MB y no se puede leer al atender una petición.
 */
final class AwsSkuCatalog {

    static final String REGION = "us-east-1";

    /**
     * @param sku        nombre corto que se muestra
     * @param offerCode  servicio en la lista de precios de AWS (da nombre al fichero)
     * @param usageType  {@code usagetype} del producto
     * @param attributes atributos que además debe tener el producto para ser el buscado
     * @param unit       unidad que debe declarar la tarifa para que el precio se acepte
     * @param note       qué cubre el precio
     */
    record AwsSku(String sku, String offerCode, String usageType, Map<String, String> attributes,
                  String unit, PricingUnit pricingUnit, String note) {
    }

    private static final Map<String, AwsSku> BY_SERVICE = Map.of(
            "kubernetes", new AwsSku("EKS cluster", "AmazonEKS", "USE1-AmazonEKS-Hours:perCluster", Map.of(),
                    "Hours", PricingUnit.HOURLY, "Solo el plano de control de un clúster de EKS con soporte estándar. Los nodos se pagan aparte."),
            "postgres", new AwsSku("db.t4g.micro", "AmazonRDS", "InstanceUsage:db.t4g.micro",
                    Map.of("databaseEngine", "PostgreSQL", "deploymentOption", "Single-AZ"),
                    "Hrs", PricingUnit.HOURLY, "Cómputo de una instancia db.t4g.micro de RDS para PostgreSQL en una zona. No incluye almacenamiento ni copias."),
            "newsql-pg", new AwsSku("Aurora db.r6g.large", "AmazonRDS", "InstanceUsage:db.r6g.large",
                    Map.of("databaseEngine", "Aurora PostgreSQL"),
                    "Hrs", PricingUnit.HOURLY, "Cómputo de una instancia db.r6g.large de Aurora PostgreSQL (Aurora Standard). No incluye almacenamiento ni E/S."),
            "redis", new AwsSku("cache.t4g.small", "AmazonElastiCache", "NodeUsage:cache.t4g.small",
                    Map.of("cacheEngine", "Redis"),
                    "Hrs", PricingUnit.HOURLY, "Un nodo cache.t4g.small de ElastiCache con Redis (1,37 GiB), sin réplica."),
            "event-stream", new AwsSku("Kinesis shard", "AmazonKinesis", "Storage-ShardHour", Map.of(),
                    "ShardHour", PricingUnit.HOURLY, "Un shard aprovisionado de Kinesis Data Streams. Las escrituras se pagan aparte, por unidades de carga."),
            "streaming", new AwsSku("kafka.m5.large", "AmazonMSK", "USE1-Kafka.m5.large", Map.of(),
                    "hours", PricingUnit.HOURLY, "Un broker kafka.m5.large de MSK. Un clúster tiene varios; no incluye almacenamiento."));

    private AwsSkuCatalog() {
    }

    static Optional<AwsSku> find(String serviceCode) {
        return Optional.ofNullable(BY_SERVICE.get(serviceCode));
    }
}
