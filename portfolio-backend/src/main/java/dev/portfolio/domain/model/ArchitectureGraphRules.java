package dev.portfolio.domain.model;

import dev.portfolio.domain.exception.InvalidRequestException;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Reglas del grafo de un proyecto de arquitectura: qué pieza puede enviar datos a cuál, entre
 * qué extremos tiene sentido cada tipo de conexión y cuántas instancias de un mismo servicio
 * admite un lienzo. Son datos ({@code architecture/graph-rules.json}), los mismos con los que
 * el Estudio avisa mientras se edita; aquí se exigen al guardar.
 *
 * @param logical      papel de datos de cada tipo de nodo; un tipo que no aparece es un servicio cualquiera
 * @param incoming     de qué papeles puede recibir una conexión cada papel
 * @param kinds        extremos válidos de cada tipo de conexión
 * @param maxInstances máximo de nodos de un mismo tipo
 */
public record ArchitectureGraphRules(
        Map<String, String> logical,
        Map<String, List<String>> incoming,
        Map<String, LinkKind> kinds,
        Map<String, Integer> maxInstances) {

    /** Extremo que no tiene un papel de datos: cualquier otra pieza del lienzo. */
    public static final String SERVICE = "service";

    public record LinkKind(List<String> from, List<String> to) {
        public LinkKind {
            from = from == null ? List.of() : List.copyOf(from);
            to = to == null ? List.of() : List.copyOf(to);
        }
    }

    public ArchitectureGraphRules {
        logical = logical == null ? Map.of() : Map.copyOf(logical);
        incoming = incoming == null ? Map.of() : Map.copyOf(incoming);
        kinds = kinds == null ? Map.of() : Map.copyOf(kinds);
        maxInstances = maxInstances == null ? Map.of() : Map.copyOf(maxInstances);
    }

    /** @throws InvalidRequestException con la primera regla que el grafo incumple */
    public void validate(List<Map<String, Object>> nodes, List<Map<String, Object>> connections) {
        List<String> violations = violations(nodes, connections);
        if (!violations.isEmpty()) {
            String more = violations.size() > 1 ? " (y " + (violations.size() - 1) + " más)" : "";
            throw new InvalidRequestException(violations.get(0) + more);
        }
    }

    /** Las reglas que incumple el grafo, en orden: primero las conexiones y luego los límites de instancias. */
    public List<String> violations(List<Map<String, Object>> nodes, List<Map<String, Object>> connections) {
        Map<String, String> typeById = new LinkedHashMap<>();
        Map<String, Integer> countByType = new LinkedHashMap<>();
        for (Map<String, Object> node : nodes) {
            if (node.get("id") instanceof String id && node.get("type") instanceof String type) {
                typeById.put(id, type);
                countByType.merge(type, 1, Integer::sum);
            }
        }

        List<String> violations = new ArrayList<>();
        for (Map<String, Object> connection : connections) {
            if (!(connection.get("from") instanceof String from) || !(connection.get("to") instanceof String to)
                    || !typeById.containsKey(from) || !typeById.containsKey(to)) {
                continue; // una conexión a un nodo que no está no dibuja nada: el editor la descarta
            }
            String source = endpointOf(typeById.get(from));
            String target = endpointOf(typeById.get(to));
            if (!SERVICE.equals(target) && !incoming.getOrDefault(target, List.of()).contains(source)) {
                violations.add("Conexión no permitida: %s → %s (un nodo «%s» no puede enviar datos a uno «%s»)"
                        .formatted(from, to, source, target));
            } else if (connection.get("kind") instanceof String kind && kinds.containsKey(kind)
                    && !(kinds.get(kind).from().contains(source) && kinds.get(kind).to().contains(target))) {
                violations.add("Tipo de conexión %s no válido entre %s y %s".formatted(kind, from, to));
            }
        }
        countByType.forEach((type, count) -> {
            Integer max = maxInstances.get(type);
            if (max != null && count > max) {
                violations.add("Demasiadas instancias de «%s»: %d de %d como máximo".formatted(type, count, max));
            }
        });
        return violations;
    }

    private String endpointOf(String type) {
        return logical.getOrDefault(type, SERVICE);
    }
}
