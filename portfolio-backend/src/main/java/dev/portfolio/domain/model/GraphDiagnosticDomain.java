package dev.portfolio.domain.model;

/**
 * Lo que una regla del grafo dice de un nodo: un error (el proyecto no se puede guardar así) o
 * un aviso (se guarda, pero conviene corregirlo), con lo que hacer cuando la regla lo sabe.
 *
 * @param nodeId     nodo junto al que se muestra
 * @param rule       regla que lo provoca: connection, link-kind, max-instances, placement o exposure
 * @param suggestion qué hacer para resolverlo; {@code null} si la regla no lo dice
 * @param from       origen de la conexión que lo provoca; {@code null} si no es una regla de conexión
 * @param to         destino de esa conexión
 */
public record GraphDiagnosticDomain(String nodeId, String rule, Severity severity, String message,
                                    String suggestion, String from, String to) {

    public enum Severity { ERROR, WARNING }
}
