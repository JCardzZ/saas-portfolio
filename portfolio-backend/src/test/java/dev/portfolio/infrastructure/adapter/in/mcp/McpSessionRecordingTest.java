package dev.portfolio.infrastructure.adapter.in.mcp;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import dev.portfolio.infrastructure.adapter.in.mcp.eval.McpEval;
import dev.portfolio.testsupport.McpTestServer;
import org.junit.jupiter.api.Test;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Una sesión MCP de verdad, mensaje a mensaje, contra el servidor: lo que vería el Inspector de
 * MCP. Habla JSON-RPC por HTTP a mano (sin el cliente del SDK) para guardar exactamente lo que
 * viaja. Con {@code MCP_SESSION_UPDATE=true} deja la grabación en
 * {@code portfolio-frontend/public/mcp/session.json}, que es la que reproduce la web en «Probar
 * sin instalar».
 * <p>
 * El diagrama es sintético y los precios y la IA del servidor de pruebas son simulados: la
 * grabación no lleva datos de nadie.
 */
class McpSessionRecordingTest {

    private static final ObjectMapper JSON = new ObjectMapper().enable(SerializationFeature.INDENT_OUTPUT);
    private static final Path RECORDING = Path.of("../portfolio-frontend/public/mcp/session.json");

    private final HttpClient http = HttpClient.newHttpClient();
    private final ArrayNode steps = JSON.createArrayNode();
    private String session;

    /** Envía un mensaje JSON-RPC y devuelve la respuesta, anotando los dos en la grabación. */
    private JsonNode send(String url, String label, ObjectNode message) throws Exception {
        HttpRequest.Builder request = HttpRequest.newBuilder(URI.create(url))
                .header("Content-Type", "application/json").header("Accept", "application/json, text/event-stream")
                .POST(HttpRequest.BodyPublishers.ofString(JSON.writeValueAsString(message)));
        if (session != null) {
            request.header("Mcp-Session-Id", session);
        }
        long started = System.nanoTime();
        HttpResponse<String> response = http.send(request.build(), HttpResponse.BodyHandlers.ofString());
        long millis = (System.nanoTime() - started) / 1_000_000;
        response.headers().firstValue("Mcp-Session-Id").ifPresent(id -> session = id);

        ObjectNode sent = steps.addObject();
        sent.put("direction", "request");
        sent.put("label", label);
        sent.set("message", message);
        if (!message.has("id")) {
            return null; // una notificación no tiene respuesta
        }
        assertThat(response.statusCode()).as(label + ": " + response.body()).isEqualTo(200);
        JsonNode answer = JSON.readTree(jsonOf(response));
        ObjectNode received = steps.addObject();
        received.put("direction", "response");
        received.put("label", label);
        received.put("ms", millis);
        received.set("message", answer);
        return answer;
    }

    /** El cuerpo como JSON: tal cual, o el dato del evento si la respuesta llega como flujo de eventos. */
    private static String jsonOf(HttpResponse<String> response) {
        String body = response.body();
        if (!response.headers().firstValue("Content-Type").orElse("").contains("text/event-stream")) {
            return body;
        }
        return body.lines().filter(line -> line.startsWith("data:")).map(line -> line.substring(5).strip())
                .filter(data -> data.contains("\"jsonrpc\"")).reduce((first, last) -> last).orElseThrow();
    }

    private static ObjectNode rpc(Integer id, String method, Object params) {
        ObjectNode message = JSON.createObjectNode();
        message.put("jsonrpc", "2.0");
        if (id != null) {
            message.put("id", id);
        }
        message.put("method", method);
        if (params != null) {
            message.set("params", JSON.valueToTree(params));
        }
        return message;
    }

    @Test
    void aWholeSessionIsRecordedMessageByMessage() throws Exception {
        Map<String, Object> exposed = McpEval.GRAPHS.get("exposed");
        try (McpTestServer server = new McpTestServer(McpObserver.NONE)) {
            String url = server.url();

            JsonNode initialized = send(url, "Conectar", rpc(1, "initialize", Map.of(
                    "protocolVersion", McpSdkServer.PROTOCOL_VERSION, "capabilities", Map.of(),
                    "clientInfo", Map.of("name", "grabacion", "version", "1.0.0"))));
            assertThat(initialized.at("/result/serverInfo/name").asText()).isEqualTo("portfolio-platform");
            assertThat(initialized.at("/result/protocolVersion").asText()).isEqualTo(McpSdkServer.PROTOCOL_VERSION);
            assertThat(session).as("el servidor abre una sesión").isNotBlank();
            send(url, "Conectar", rpc(null, "notifications/initialized", null));

            JsonNode tools = send(url, "Ver las herramientas", rpc(2, "tools/list", null));
            assertThat(tools.at("/result/tools")).hasSize(6);

            JsonNode validated = send(url, "Validar una arquitectura", rpc(3, "tools/call", Map.of("name", "validar_arquitectura",
                    "arguments", Map.of("nodos", exposed.get("nodos"), "conexiones", exposed.get("conexiones"), "nube", "aws"))));
            assertThat(validated.at("/result/isError").asBoolean()).isFalse();
            assertThat(validated.at("/result/content/0/text").asText()).contains("Pon una API en medio");

            JsonNode terraform = send(url, "Generar Terraform", rpc(4, "tools/call", Map.of("name", "generar_terraform",
                    "arguments", Map.of("nodos", exposed.get("nodos"), "conexiones", exposed.get("conexiones"), "nube", "aws"))));
            assertThat(terraform.at("/result/structuredContent/esqueleto").asBoolean()).isTrue();

            JsonNode costs = send(url, "Estimar costes", rpc(5, "tools/call", Map.of("name", "estimar_costos",
                    "arguments", Map.of("nube", "aws", "servicios", java.util.List.of("postgres", "functions")))));
            assertThat(costs.at("/result/content/0/text").asText()).contains("sin estimación");
        }

        ObjectNode recording = JSON.createObjectNode();
        recording.put("protocolVersion", McpSdkServer.PROTOCOL_VERSION);
        recording.put("note", "Sesión real contra el servidor MCP de la plataforma, con un diagrama sintético. Los precios de esta grabación son de prueba.");
        // El identificador de sesión no se guarda: no hace falta para entender la conversación.
        recording.set("steps", steps);
        assertThat(steps).hasSize(11);
        assertThat(recording.toString()).doesNotContain(session);
        if ("true".equals(System.getenv("MCP_SESSION_UPDATE"))) {
            Files.createDirectories(RECORDING.getParent());
            Files.writeString(RECORDING, JSON.writeValueAsString(recording) + "\n");
        }
    }
}
