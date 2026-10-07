package dev.portfolio.domain.model;

import dev.portfolio.domain.exception.InvalidRequestException;

import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * Límites del grafo de un proyecto de arquitectura. La forma de cada nodo, conexión o zona es
 * cosa del editor (que la valida al cargar); aquí se garantiza que lo recibido es JSON sencillo
 * y de tamaño acotado, porque llega de fuera y se guarda y se sirve a otros.
 */
public final class ArchitectureGraph {

    public static final int MAX_NODES = 60;
    public static final int MAX_CONNECTIONS = 200;
    public static final int MAX_ZONES = 24;
    private static final int MAX_DEPTH = 5;
    private static final int MAX_CHARACTERS = 200_000;
    private static final Pattern NODE_ID = Pattern.compile("^[A-Za-z0-9_-]{1,48}$");

    private ArchitectureGraph() {
    }

    /** @throws InvalidRequestException si alguna lista falta, es demasiado grande o contiene algo que no es JSON sencillo */
    public static void validate(List<Map<String, Object>> nodes, List<Map<String, Object>> connections, List<Map<String, Object>> zones) {
        requireList(nodes, "nodos", MAX_NODES);
        requireList(connections, "conexiones", MAX_CONNECTIONS);
        requireList(zones, "zonas", MAX_ZONES);
        for (Map<String, Object> node : nodes) {
            if (!(node.get("id") instanceof String id) || !NODE_ID.matcher(id).matches()) {
                throw new InvalidRequestException("Cada nodo necesita un id de letras, cifras, guiones o guiones bajos");
            }
        }
        int[] budget = {MAX_CHARACTERS};
        measure(nodes, 0, budget);
        measure(connections, 0, budget);
        measure(zones, 0, budget);
    }

    private static void requireList(List<Map<String, Object>> list, String name, int max) {
        if (list == null) {
            throw new InvalidRequestException("Faltan los " + ("zonas".equals(name) || "conexiones".equals(name) ? "datos de " : "") + name + " del proyecto");
        }
        if (list.size() > max) {
            throw new InvalidRequestException("El proyecto tiene demasiados elementos en " + name + " (máximo " + max + ")");
        }
        if (list.stream().anyMatch(element -> element == null)) {
            throw new InvalidRequestException("El proyecto contiene elementos vacíos en " + name);
        }
    }

    /** Recorre el valor descontando su tamaño; solo admite objetos, listas, textos, números, booleanos y nulos. */
    private static void measure(Object value, int depth, int[] budget) {
        if (depth > MAX_DEPTH) {
            throw new InvalidRequestException("El proyecto tiene datos demasiado anidados");
        }
        if (value == null || value instanceof Boolean || value instanceof Number) {
            budget[0] -= 8;
        } else if (value instanceof String text) {
            budget[0] -= text.length() + 2;
        } else if (value instanceof List<?> list) {
            list.forEach(element -> measure(element, depth + 1, budget));
        } else if (value instanceof Map<?, ?> map) {
            map.forEach((key, element) -> {
                if (!(key instanceof String name)) {
                    throw new InvalidRequestException("El proyecto contiene datos que no son JSON");
                }
                budget[0] -= name.length() + 2;
                measure(element, depth + 1, budget);
            });
        } else {
            throw new InvalidRequestException("El proyecto contiene datos que no son JSON");
        }
        if (budget[0] < 0) {
            throw new InvalidRequestException("El proyecto es demasiado grande");
        }
    }
}
