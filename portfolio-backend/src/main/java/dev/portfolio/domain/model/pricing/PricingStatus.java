package dev.portfolio.domain.model.pricing;

/** De dónde sale (o por qué no hay) el precio de un servicio. */
public enum PricingStatus {

    /** Recién leído de la API pública del proveedor. */
    LIVE,
    /** Leído del proveedor dentro del periodo de validez de la caché. */
    CACHED,
    /** El proveedor no responde: es la última tarifa conocida, ya caducada. */
    STALE,
    /** No hay SKU asignado a ese servicio o no se pudo obtener ningún precio. No se inventa. */
    UNKNOWN_PRICING,
    /** Producto con licencia o contrato: su precio no está en ninguna API pública. */
    UNESTIMATED_ENTERPRISE_LICENSE;

    /** ¿Trae un precio? */
    public boolean priced() {
        return this == LIVE || this == CACHED || this == STALE;
    }
}
