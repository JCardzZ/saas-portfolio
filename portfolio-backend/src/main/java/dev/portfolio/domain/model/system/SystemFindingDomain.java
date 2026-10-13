package dev.portfolio.domain.model.system;

/**
 * Lo que una comprobación dice de un diseño de sistema, con qué hacer cuando lo sabe.
 *
 * @param rule       regla que lo provoca ({@code rps-cache}, {@code deployment-invalid}…)
 * @param kind       {@code input} (lo pedido no es válido), {@code deployment} o {@code nfr}
 * @param category   categoría de la vista de Aplicación a la que se refiere; {@code null} si no hay
 * @param nodeId     nodo de infraestructura al que se refiere; {@code null} si no hay
 * @param suggestion qué hacer; {@code null} si la regla no lo dice
 */
public record SystemFindingDomain(String rule, String kind, Severity severity, String category, String nodeId,
                                  String message, String suggestion) {

    public enum Severity { ERROR, WARNING }

    static SystemFindingDomain input(String rule, String category, String message, String suggestion) {
        return new SystemFindingDomain(rule, "input", Severity.ERROR, category, null, message, suggestion);
    }
}
