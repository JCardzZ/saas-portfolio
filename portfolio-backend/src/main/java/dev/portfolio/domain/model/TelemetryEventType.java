package dev.portfolio.domain.model;

public enum TelemetryEventType {
    CACHE_HIT,
    CACHE_MISS,
    VECTOR_SEARCH,
    RAG_QUERY,
    JWT_VERIFIED,
    /** Se va a pedir una tarifa a la API pública de un proveedor cloud. */
    PRICING_REQUEST,
    /** Una tarifa leída del proveedor queda guardada en caché. */
    PRICING_CACHED,
    /** Un servicio no tiene precio público: queda sin estimación. */
    PRICING_UNESTIMATED,
    /** El proveedor no respondió: se sirve la última tarifa conocida o ninguna. */
    PRICING_FALLBACK,
    /** Se ha llamado a una herramienta del servidor MCP. Solo cuenta cuál, cómo acabó y cuánto tardó. */
    MCP_TOOL_CALL
}
