package dev.portfolio.application.port.in;

/**
 * Consumo del servidor MCP. No hay cuentas: se limita por origen y, entre todos los orígenes,
 * por día, para que nadie agote la plataforma ni lo que cuesta detrás (precios, IA).
 */
public interface McpAccessUseCase {

    /**
     * Cuenta una llamada a una herramienta.
     *
     * @param clientKey origen de la llamada
     * @throws dev.portfolio.domain.exception.RateLimitExceededException si ese origen, o el total del día, ha agotado su cupo
     */
    void admit(String clientKey);

    /** Los límites vigentes, para contarlos a quien se conecta. */
    Limits limits();

    /**
     * @param perClient      llamadas por origen en {@code perClientWindowSeconds}
     * @param dailyTotal     llamadas entre todos los orígenes en un día
     */
    record Limits(int perClient, long perClientWindowSeconds, int dailyTotal) {
    }
}
