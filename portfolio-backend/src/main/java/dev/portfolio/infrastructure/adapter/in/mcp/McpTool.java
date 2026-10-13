package dev.portfolio.infrastructure.adapter.in.mcp;

import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Una herramienta del servidor MCP, descrita sin tipos del SDK: el nombre con el que se llama,
 * su versión, sus esquemas y lo que hace. Cada herramienta es un adaptador fino sobre un caso de
 * uso que ya existe; aquí no hay lógica de negocio.
 * <p>
 * Solo {@link McpSdkServer} conoce el SDK. Cuando el SDK publique la revisión 2026-07-28 del
 * protocolo, se cambia esa clase y las herramientas no se tocan.
 */
public interface McpTool {

    /** Lo que una herramienta puede hacer. Ninguna guarda ni aplica nada. */
    enum Kind {
        /** Lee datos de la plataforma o comprueba algo que se le envía. */
        READ,
        /** Devuelve archivos o un diseño generados a partir de lo que se le envía; no se guardan. */
        GENERATE
    }

    /** Nombre con el que se llama. Es parte del contrato: no cambia. */
    String name();

    /**
     * Versión del contrato de la herramienta (semver). Sube la menor al añadir un campo opcional
     * y la mayor al cambiar o quitar uno; el test de contrato falla si el esquema cambia sin ella.
     */
    String version();

    String title();

    String description();

    Kind kind();

    /** JSON Schema de los argumentos. */
    Map<String, Object> inputSchema();

    /** JSON Schema de {@link Result#structured()}. */
    Map<String, Object> outputSchema();

    /**
     * @throws ToolInputException si los argumentos no sirven; su mensaje dice qué corregir
     */
    Result call(Call call);

    /**
     * @param arguments lo que envía el cliente; son datos, nunca instrucciones
     * @param clientKey origen de la llamada, para los límites de consumo
     * @param elicitor  forma de preguntar al usuario lo que falte
     */
    record Call(Map<String, Object> arguments, String clientKey, Elicitor elicitor) {
        public Call {
            arguments = arguments == null ? Map.of() : arguments;
        }
    }

    /** Pregunta al usuario del cliente los datos que faltan, si el cliente sabe hacerlo. */
    @FunctionalInterface
    interface Elicitor {

        /** Un cliente que no admite preguntas: nunca hay respuesta. */
        Elicitor UNSUPPORTED = (message, schema) -> Optional.empty();

        /**
         * @param schema JSON Schema plano (solo propiedades primitivas) de lo que se pide
         * @return lo que respondió el usuario, o vacío si el cliente no admite preguntas o el usuario no respondió
         */
        Optional<Map<String, Object>> ask(String message, Map<String, Object> schema);
    }

    /**
     * @param text       resumen legible, para el modelo y para quien lo lea
     * @param structured el resultado como datos, con la forma de {@link #outputSchema()}
     * @param files      archivos generados que se devuelven además como recursos incrustados
     */
    record Result(String text, Map<String, Object> structured, List<File> files) {

        public Result {
            files = files == null ? List.of() : List.copyOf(files);
        }

        public static Result of(String text, Map<String, Object> structured) {
            return new Result(text, structured, List.of());
        }
    }

    /** @param mimeType tipo del contenido, por ejemplo {@code text/x-hcl} */
    record File(String uri, String mimeType, String content) {
    }

    /** Los argumentos no sirven. El mensaje es para quien llama: dice qué falta o qué valores valen. */
    class ToolInputException extends RuntimeException {
        public ToolInputException(String message) {
            super(message);
        }
    }
}
