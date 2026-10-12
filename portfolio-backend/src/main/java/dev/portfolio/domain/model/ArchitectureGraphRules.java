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
 * @param advice       por qué cada papel no recibe de cualquiera y qué hacer en su lugar
 * @param placement    piezas que no deberían estar en ciertas zonas de red; avisan, no impiden guardar
 * @param exposure     conexiones directas desde una zona que conviene pasar por una pieza intermedia; avisan
 */
public record ArchitectureGraphRules(
        Map<String, String> logical,
        Map<String, List<String>> incoming,
        Map<String, LinkKind> kinds,
        Map<String, Integer> maxInstances,
        Map<String, Advice> advice,
        List<PlacementRule> placement,
        List<ExposureRule> exposure) {

    /** Extremo que no tiene un papel de datos: cualquier otra pieza del lienzo. */
    public static final String SERVICE = "service";

    public record LinkKind(List<String> from, List<String> to) {
        public LinkKind {
            from = from == null ? List.of() : List.copyOf(from);
            to = to == null ? List.of() : List.copyOf(to);
        }
    }

    public record Advice(String why, String suggestion) {
    }

    /** En {@code message} y {@code suggestion}, <code>{node}</code> es el nombre de la pieza. */
    public record PlacementRule(String id, List<String> endpoints, List<String> zones, String message, String suggestion) {
        public PlacementRule {
            endpoints = endpoints == null ? List.of() : List.copyOf(endpoints);
            zones = zones == null ? List.of() : List.copyOf(zones);
        }
    }

    /** En {@code message} y {@code suggestion}, <code>{from}</code> y <code>{to}</code> son los nombres de los dos extremos. */
    public record ExposureRule(String id, List<String> fromZones, List<String> to, String message, String suggestion) {
        public ExposureRule {
            fromZones = fromZones == null ? List.of() : List.copyOf(fromZones);
            to = to == null ? List.of() : List.copyOf(to);
        }
    }

    public ArchitectureGraphRules {
        logical = logical == null ? Map.of() : Map.copyOf(logical);
        incoming = incoming == null ? Map.of() : Map.copyOf(incoming);
        kinds = kinds == null ? Map.of() : Map.copyOf(kinds);
        maxInstances = maxInstances == null ? Map.of() : Map.copyOf(maxInstances);
        advice = advice == null ? Map.of() : Map.copyOf(advice);
        placement = placement == null ? List.of() : List.copyOf(placement);
        exposure = exposure == null ? List.of() : List.copyOf(exposure);
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

    /**
     * Lo mismo que {@link #violations}, nodo a nodo y con qué hacer, más los avisos de colocación
     * y de exposición, que no impiden guardar. Los nodos se nombran como en el lienzo: por su
     * nombre propio o, si no tienen, por su servicio.
     */
    public List<GraphDiagnosticDomain> diagnostics(List<Map<String, Object>> nodes, List<Map<String, Object>> connections) {
        Map<String, Map<String, Object>> byId = new LinkedHashMap<>();
        Map<String, List<String>> idsByType = new LinkedHashMap<>();
        for (Map<String, Object> node : nodes) {
            if (node.get("id") instanceof String id && node.get("type") instanceof String type) {
                byId.put(id, node);
                idsByType.computeIfAbsent(type, key -> new ArrayList<>()).add(id);
            }
        }

        List<GraphDiagnosticDomain> found = new ArrayList<>();
        for (Map<String, Object> connection : connections) {
            if (!(connection.get("from") instanceof String from) || !(connection.get("to") instanceof String to)
                    || !byId.containsKey(from) || !byId.containsKey(to)) {
                continue;
            }
            String source = endpointOf((String) byId.get(from).get("type"));
            String target = endpointOf((String) byId.get(to).get("type"));
            Map<String, String> names = Map.of("from", nameOf(byId.get(from)), "to", nameOf(byId.get(to)));
            if (!SERVICE.equals(target) && !incoming.getOrDefault(target, List.of()).contains(source)) {
                Advice why = advice.get(target);
                found.add(new GraphDiagnosticDomain(to, "connection", GraphDiagnosticDomain.Severity.ERROR,
                        "%s no puede enviar datos a %s.%s".formatted(names.get("from"), names.get("to"), why == null ? "" : " " + why.why()),
                        why == null ? null : why.suggestion(), from, to));
                continue;
            }
            if (connection.get("kind") instanceof String kind && kinds.containsKey(kind)
                    && !(kinds.get(kind).from().contains(source) && kinds.get(kind).to().contains(target))) {
                found.add(new GraphDiagnosticDomain(to, "link-kind", GraphDiagnosticDomain.Severity.ERROR,
                        "Tipo de conexión %s no válido entre %s y %s.".formatted(kind, names.get("from"), names.get("to")), null, from, to));
            }
            for (ExposureRule rule : exposure) {
                if (byId.get(from).get("zone") instanceof String zone && rule.fromZones().contains(zone) && rule.to().contains(target)) {
                    found.add(new GraphDiagnosticDomain(to, "exposure", GraphDiagnosticDomain.Severity.WARNING,
                            fill(rule.message(), names), fill(rule.suggestion(), names), from, to));
                }
            }
        }
        idsByType.forEach((type, ids) -> {
            Integer max = maxInstances.get(type);
            if (max != null && ids.size() > max) {
                // El diagnóstico va en las instancias que sobran, no en las primeras.
                for (String extra : ids.subList(max, ids.size())) {
                    found.add(new GraphDiagnosticDomain(extra, "max-instances", GraphDiagnosticDomain.Severity.ERROR,
                            "Demasiadas instancias de %s: %d de %d como máximo.".formatted(nameOf(byId.get(extra)), ids.size(), max),
                            "Quita las que sobran.", null, null));
                }
            }
        });
        byId.forEach((id, node) -> {
            String endpoint = endpointOf((String) node.get("type"));
            for (PlacementRule rule : placement) {
                if (node.get("zone") instanceof String zone && rule.zones().contains(zone) && rule.endpoints().contains(endpoint)) {
                    Map<String, String> names = Map.of("node", nameOf(node));
                    found.add(new GraphDiagnosticDomain(id, "placement", GraphDiagnosticDomain.Severity.WARNING,
                            fill(rule.message(), names), fill(rule.suggestion(), names), null, null));
                }
            }
        });
        return found;
    }

    /** Nombre con el que se ve un nodo: el propio, el de su servicio o, si no hay otro, su id. */
    private static String nameOf(Map<String, Object> node) {
        if (node.get("name") instanceof String name && !name.isBlank()) {
            return name.strip();
        }
        if (node.get("service") instanceof String service && !service.isBlank()) {
            return service;
        }
        return String.valueOf(node.get("id"));
    }

    private static String fill(String template, Map<String, String> names) {
        String text = template;
        for (Map.Entry<String, String> name : names.entrySet()) {
            text = text.replace("{" + name.getKey() + "}", name.getValue());
        }
        return text;
    }

    private String endpointOf(String type) {
        return logical.getOrDefault(type, SERVICE);
    }
}
