package dev.portfolio.infrastructure.adapter.in.mcp;

import dev.portfolio.domain.model.CloudProviderDomain;
import dev.portfolio.infrastructure.adapter.in.mcp.McpTool.ToolInputException;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Lectura de los argumentos de una herramienta. Lo que llega es de un cliente cualquiera: aquí
 * se comprueba su tipo y, si no sirve, se dice qué se esperaba para que quien llama lo corrija.
 */
final class McpArguments {

    /** Nubes que se pueden pedir por MCP. Oracle Cloud no: sigue detrás de su propia flag en la web. */
    static final List<String> CLOUDS = List.of("aws", "gcp", "azure");
    static final int MAX_TEXT = 2000;

    private McpArguments() {
    }

    static Map<String, Object> cloudSchema(String description) {
        return Map.of("type", "string", "enum", CLOUDS, "description", description);
    }

    /** Esquema de una lista de elementos del grafo (nodos o conexiones), con su tope. */
    static Map<String, Object> graphSchema(String description, int maxItems) {
        return Map.of("type", "array", "maxItems", maxItems, "description", description,
                "items", Map.of("type", "object"));
    }

    static Optional<CloudProviderDomain> cloud(Map<String, Object> arguments, String name) {
        Object value = arguments.get(name);
        if (value == null) {
            return Optional.empty();
        }
        if (!(value instanceof String code) || !CLOUDS.contains(code)) {
            throw new ToolInputException("«%s» tiene que ser una de estas nubes: %s.".formatted(name, String.join(", ", CLOUDS)));
        }
        return Optional.of(CloudProviderDomain.fromCode(code));
    }

    static CloudProviderDomain requiredCloud(Map<String, Object> arguments, String name) {
        return cloud(arguments, name).orElseThrow(() ->
                new ToolInputException("Falta «%s»: una de %s.".formatted(name, String.join(", ", CLOUDS))));
    }

    /** Una lista de objetos del grafo. Cada elemento tiene que ser un objeto JSON. */
    @SuppressWarnings("unchecked")
    static List<Map<String, Object>> graph(Map<String, Object> arguments, String name) {
        Object value = arguments.get(name);
        if (value == null) {
            return List.of();
        }
        if (!(value instanceof List<?> list)) {
            throw new ToolInputException("«%s» tiene que ser una lista de objetos.".formatted(name));
        }
        List<Map<String, Object>> elements = new ArrayList<>();
        for (Object element : list) {
            if (!(element instanceof Map<?, ?> map)) {
                throw new ToolInputException("Cada elemento de «%s» tiene que ser un objeto.".formatted(name));
            }
            elements.add(new LinkedHashMap<>((Map<String, Object>) map));
        }
        return elements;
    }

    static Optional<String> text(Map<String, Object> arguments, String name) {
        Object value = arguments.get(name);
        if (value == null) {
            return Optional.empty();
        }
        if (!(value instanceof String text)) {
            throw new ToolInputException("«%s» tiene que ser un texto.".formatted(name));
        }
        if (text.length() > MAX_TEXT) {
            throw new ToolInputException("«%s» no puede superar los %d caracteres.".formatted(name, MAX_TEXT));
        }
        return text.isBlank() ? Optional.empty() : Optional.of(text.strip());
    }

    static Optional<Double> number(Map<String, Object> arguments, String name) {
        Object value = arguments.get(name);
        if (value == null) {
            return Optional.empty();
        }
        if (!(value instanceof Number number) || Double.isNaN(number.doubleValue()) || Double.isInfinite(number.doubleValue())) {
            throw new ToolInputException("«%s» tiene que ser un número.".formatted(name));
        }
        return Optional.of(number.doubleValue());
    }

    static List<String> texts(Map<String, Object> arguments, String name) {
        Object value = arguments.get(name);
        if (value == null) {
            return List.of();
        }
        if (!(value instanceof List<?> list) || list.stream().anyMatch(element -> !(element instanceof String))) {
            throw new ToolInputException("«%s» tiene que ser una lista de textos.".formatted(name));
        }
        return list.stream().map(String.class::cast).toList();
    }

    /**
     * Un texto que vino de fuera, para devolverlo en un resultado: en una línea, sin caracteres
     * de control y acotado. Lo que escribe un tercero viaja como dato, nunca como formato.
     */
    static String quoted(String text) {
        String clean = text == null ? "" : text.replaceAll("\\p{Cntrl}+", " ").strip();
        return clean.length() > 200 ? clean.substring(0, 200) + "…" : clean;
    }
}
