package dev.portfolio.application.service;

import dev.portfolio.domain.model.CloudProviderDomain;
import dev.portfolio.domain.model.system.SystemDesignDomain;
import dev.portfolio.domain.model.system.SystemDesignRules;
import dev.portfolio.domain.model.system.SystemDesignRules.Category;
import dev.portfolio.domain.model.system.SystemDesignRules.Option;
import dev.portfolio.domain.model.system.SystemFindingDomain;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Los archivos de partida de un diseño de sistema que no son Terraform: el contrato inicial de
 * la API, el {@code docker-compose.yml} de desarrollo y el README. Todo sale de lo elegido en
 * el catálogo: nada de lo que escribe quien llama (nombres de nodos aparte, que van escapados)
 * llega a los archivos.
 * <p>
 * Son esqueletos: un recurso de ejemplo, sin el modelo del negocio.
 */
final class SystemDesignGenerator {

    private SystemDesignGenerator() {
    }

    // ---------- Contrato de la API ----------

    /** OpenAPI 3.0 inicial: salud, un recurso de ejemplo y el esquema de seguridad de la autenticación elegida. */
    static String openApi(SystemDesignDomain design) {
        String auth = design.choices().getOrDefault("auth", "");
        List<String> lines = new ArrayList<>(List.of(
                "# openapi.yaml — contrato inicial generado desde el diseño del sistema",
                "# Esqueleto: un recurso de ejemplo (items). Sustitúyelo por los recursos de tu dominio.",
                "openapi: 3.0.3",
                "info:",
                "  title: API del sistema",
                "  version: 0.1.0",
                "  description: Contrato inicial. Primero se cambia este archivo y después el código.",
                "servers:",
                "  - url: http://localhost:8080",
                "    description: Desarrollo local",
                "tags:",
                "  - name: Items",
                "  - name: Health",
                "paths:",
                "  /health:",
                "    get:",
                "      tags: [Health]",
                "      summary: Estado del servicio",
                "      operationId: getHealth",
                "      security: []",
                "      responses:",
                "        '200':",
                "          description: El servicio responde.",
                "          content:",
                "            application/json:",
                "              schema:",
                "                $ref: '#/components/schemas/Health'",
                "  /items:",
                "    get:",
                "      tags: [Items]",
                "      summary: Lista de items",
                "      operationId: listItems",
                "      parameters:",
                "        - name: limit",
                "          in: query",
                "          schema: { type: integer, minimum: 1, maximum: 100, default: 20 }",
                "      responses:",
                "        '200':",
                "          description: Una página de items.",
                "          content:",
                "            application/json:",
                "              schema:",
                "                type: array",
                "                items:",
                "                  $ref: '#/components/schemas/Item'",
                "        '401':",
                "          $ref: '#/components/responses/Unauthorized'",
                "    post:",
                "      tags: [Items]",
                "      summary: Crea un item",
                "      operationId: createItem",
                "      requestBody:",
                "        required: true",
                "        content:",
                "          application/json:",
                "            schema:",
                "              $ref: '#/components/schemas/ItemDraft'",
                "      responses:",
                "        '201':",
                "          description: Item creado.",
                "          content:",
                "            application/json:",
                "              schema:",
                "                $ref: '#/components/schemas/Item'",
                "        '400':",
                "          $ref: '#/components/responses/BadRequest'",
                "        '401':",
                "          $ref: '#/components/responses/Unauthorized'",
                "  /items/{id}:",
                "    get:",
                "      tags: [Items]",
                "      summary: Un item por su id",
                "      operationId: getItem",
                "      parameters:",
                "        - name: id",
                "          in: path",
                "          required: true",
                "          schema: { type: string }",
                "      responses:",
                "        '200':",
                "          description: El item.",
                "          content:",
                "            application/json:",
                "              schema:",
                "                $ref: '#/components/schemas/Item'",
                "        '401':",
                "          $ref: '#/components/responses/Unauthorized'",
                "        '404':",
                "          $ref: '#/components/responses/NotFound'",
                "security:"));
        lines.add("  - " + securityName(auth) + ": []");
        lines.addAll(List.of(
                "components:",
                "  securitySchemes:"));
        lines.addAll(securityScheme(auth));
        lines.addAll(List.of(
                "  responses:",
                "    BadRequest:",
                "      description: La petición no es válida.",
                "      content:",
                "        application/problem+json:",
                "          schema:",
                "            $ref: '#/components/schemas/Problem'",
                "    Unauthorized:",
                "      description: Falta la credencial o no es válida.",
                "      content:",
                "        application/problem+json:",
                "          schema:",
                "            $ref: '#/components/schemas/Problem'",
                "    NotFound:",
                "      description: El recurso no existe.",
                "      content:",
                "        application/problem+json:",
                "          schema:",
                "            $ref: '#/components/schemas/Problem'",
                "  schemas:",
                "    Health:",
                "      type: object",
                "      required: [status]",
                "      properties:",
                "        status: { type: string, example: UP }",
                "    ItemDraft:",
                "      type: object",
                "      required: [name]",
                "      properties:",
                "        name: { type: string, maxLength: 120 }",
                "    Item:",
                "      type: object",
                "      required: [id, name, createdAt]",
                "      properties:",
                "        id: { type: string }",
                "        name: { type: string, maxLength: 120 }",
                "        createdAt: { type: string, format: date-time }",
                "    Problem:",
                "      type: object",
                "      required: [title, status]",
                "      properties:",
                "        type: { type: string, format: uri }",
                "        title: { type: string }",
                "        status: { type: integer }",
                "        detail: { type: string }",
                ""));
        return String.join("\n", lines);
    }

    private static String securityName(String auth) {
        return switch (auth) {
            case "oidc-managed" -> "openId";
            case "session" -> "sessionCookie";
            default -> "bearerAuth";
        };
    }

    private static List<String> securityScheme(String auth) {
        return switch (auth) {
            case "oidc-managed" -> List.of(
                    "    openId:",
                    "      type: openIdConnect",
                    "      # Sustituye el dominio por el de tu proveedor de identidad.",
                    "      openIdConnectUrl: https://identity.example.com/.well-known/openid-configuration");
            case "session" -> List.of(
                    "    sessionCookie:",
                    "      type: apiKey",
                    "      in: cookie",
                    "      name: SESSION");
            default -> List.of(
                    "    bearerAuth:",
                    "      type: http",
                    "      scheme: bearer",
                    "      bearerFormat: JWT");
        };
    }

    /** Definición proto3 inicial: el mismo recurso de ejemplo que el contrato OpenAPI. */
    static String proto() {
        return String.join("\n", List.of(
                "// service.proto — contrato inicial generado desde el diseño del sistema",
                "// Esqueleto: un servicio de ejemplo (items). Sustitúyelo por los servicios de tu dominio.",
                "syntax = \"proto3\";",
                "",
                "package system.v1;",
                "",
                "import \"google/protobuf/timestamp.proto\";",
                "",
                "service ItemService {",
                "  rpc ListItems(ListItemsRequest) returns (ListItemsResponse);",
                "  rpc GetItem(GetItemRequest) returns (Item);",
                "  rpc CreateItem(CreateItemRequest) returns (Item);",
                "}",
                "",
                "message Item {",
                "  string id = 1;",
                "  string name = 2;",
                "  google.protobuf.Timestamp created_at = 3;",
                "}",
                "",
                "message ListItemsRequest {",
                "  int32 limit = 1;",
                "}",
                "",
                "message ListItemsResponse {",
                "  repeated Item items = 1;",
                "}",
                "",
                "message GetItemRequest {",
                "  string id = 1;",
                "}",
                "",
                "message CreateItemRequest {",
                "  string name = 1;",
                "}",
                ""));
    }

    // ---------- docker-compose ----------

    /**
     * Servicios locales de lo elegido que tiene una imagen oficial para desarrollar. Lo que solo
     * existe gestionado en la nube deja un comentario en vez de un contenedor inventado.
     * Las imágenes y sus etiquetas se comprobaron en Docker Hub el 2026-10-11.
     */
    static String dockerCompose(SystemDesignDomain design) {
        List<String> services = new ArrayList<>();
        List<String> volumes = new ArrayList<>();
        List<String> notes = new ArrayList<>();
        Map<String, String> choices = design.choices();

        switch (choices.getOrDefault("database", "")) {
            case "postgresql" -> {
                services.addAll(List.of(
                        "  database:",
                        "    image: postgres:17",
                        "    environment:",
                        "      POSTGRES_DB: app",
                        "      POSTGRES_USER: app",
                        "      # Solo para desarrollo local: en la nube la contraseña sale del gestor de secretos.",
                        "      POSTGRES_PASSWORD: ${DATABASE_PASSWORD:?define DATABASE_PASSWORD en .env}",
                        "    ports:",
                        "      - \"5432:5432\"",
                        "    volumes:",
                        "      - database-data:/var/lib/postgresql/data"));
                volumes.add("  database-data:");
            }
            case "document" -> {
                services.addAll(List.of(
                        "  database:",
                        "    image: mongo:8",
                        "    ports:",
                        "      - \"27017:27017\"",
                        "    volumes:",
                        "      - database-data:/data/db"));
                volumes.add("  database-data:");
            }
            case "key-value" -> notes.add("# Base de datos clave-valor gestionada: no tiene un contenedor oficial equivalente; se desarrolla contra la nube o su emulador.");
            default -> { }
        }

        boolean session = "session".equals(choices.get("auth"));
        if ("redis".equals(choices.get("cache")) || session) {
            services.addAll(List.of(
                    "  cache:",
                    "    image: redis:8",
                    "    ports:",
                    "      - \"6379:6379\""));
        }
        if ("cdn".equals(choices.get("cache"))) {
            notes.add("# Caché en el borde: no se emula en local; las cabeceras Cache-Control se prueban contra el backend.");
        }

        switch (choices.getOrDefault("queue", "")) {
            case "queue" -> services.addAll(List.of(
                    "  queue:",
                    "    image: rabbitmq:4-management",
                    "    ports:",
                    "      - \"5672:5672\"",
                    "      - \"15672:15672\""));
            case "stream" -> services.addAll(List.of(
                    "  stream:",
                    "    image: apache/kafka:4.2.2",
                    "    ports:",
                    "      - \"9092:9092\""));
            case "pubsub" -> notes.add("# Publicación y suscripción gestionada: no tiene un contenedor oficial equivalente; se desarrolla contra la nube o su emulador.");
            default -> { }
        }
        if ("oidc-managed".equals(choices.get("auth"))) {
            notes.add("# Proveedor de identidad gestionado: en local se apunta al entorno de pruebas del proveedor.");
        }

        List<String> lines = new ArrayList<>(List.of(
                "# docker-compose.yml — servicios para desarrollar en local, generado desde el diseño del sistema",
                "# No es el despliegue: en la nube cada pieza va en el servicio gestionado del main.tf."));
        lines.addAll(notes);
        if (services.isEmpty()) {
            lines.add("services: {}");
        } else {
            lines.add("services:");
            lines.addAll(services);
        }
        if (!volumes.isEmpty()) {
            lines.add("volumes:");
            lines.addAll(volumes);
        }
        lines.add("");
        return String.join("\n", lines);
    }

    // ---------- README ----------

    static String readme(SystemDesignDomain design, SystemDesignRules rules, List<Map<String, Object>> nodes, CloudProviderDomain provider,
                         List<String> files, List<SystemFindingDomain> findings) {
        Map<String, Map<String, Object>> byId = new LinkedHashMap<>();
        nodes.forEach(node -> {
            if (node != null && node.get("id") instanceof String id) {
                byId.put(id, node);
            }
        });
        List<String> lines = new ArrayList<>(List.of(
                "# Diseño del sistema",
                "",
                "Punto de partida generado desde el Estudio de arquitectura. Son esqueletos para completar:",
                "nada de esto se puede desplegar tal cual.",
                "",
                "## Aplicación",
                "",
                "| Pieza | Elección | Se despliega en |",
                "| --- | --- | --- |"));
        for (Category category : rules.catalog()) {
            Optional<Option> option = rules.chosen(design, category);
            if (option.isEmpty()) {
                continue;
            }
            String where;
            Map<String, Object> node = byId.get(design.deployments().getOrDefault(category.id(), ""));
            if (option.get().deploysOn().isEmpty()) {
                where = option.get().notDeployed() == null ? "—" : option.get().notDeployed();
            } else if (node == null) {
                where = "Sin desplegar";
            } else {
                where = SystemDesignRules.nameOf(node, provider);
            }
            lines.add("| %s | %s | %s |".formatted(cell(category.name()), cell(option.get().name()), cell(where)));
        }

        lines.addAll(List.of("", "## Infraestructura", "", "Nube: " + provider.displayName() + ". " + byId.size() + " piezas; el detalle está en `main.tf`."));

        SystemDesignDomain.NonFunctional nfr = design.nfr();
        List<String> asked = new ArrayList<>();
        for (SystemDesignRules.Input input : rules.inputs()) {
            Double value = nfr.value(input.field());
            if (value != null) {
                asked.add("- %s: %s %s".formatted(input.name(), SystemDesignRules.plain(value), input.unit()));
            }
        }
        for (SystemDesignRules.ComplianceOption option : rules.compliance()) {
            if (nfr.compliance().contains(option.id())) {
                asked.add("- " + option.name());
            }
        }
        lines.addAll(List.of("", "## Requisitos no funcionales", ""));
        lines.addAll(asked.isEmpty() ? List.of("No se ha pedido ninguno.") : asked);

        lines.addAll(List.of("", "## Pendiente de resolver", ""));
        if (findings.isEmpty()) {
            lines.add("Las comprobaciones del Estudio no tienen nada que decir de este diseño.");
        } else {
            for (SystemFindingDomain finding : findings) {
                lines.add("- " + cell(finding.message()) + (finding.suggestion() == null ? "" : " " + cell(finding.suggestion())));
            }
        }

        lines.addAll(List.of("", "## Archivos", ""));
        for (String file : files) {
            lines.add("- `" + file + "`: " + describe(file));
        }
        lines.addAll(List.of(
                "",
                "## Por dónde seguir",
                "",
                "1. Completa el contrato de la API con los recursos de tu dominio antes de escribir código.",
                "2. Levanta los servicios locales con `docker compose up` (define antes las variables que pide en `.env`).",
                "3. Completa los argumentos de cada recurso de `main.tf`; `terraform validate` dirá lo que falta.",
                ""));
        return String.join("\n", lines);
    }

    private static String describe(String file) {
        return switch (file) {
            case "main.tf" -> "esqueleto de la infraestructura: proveedores, red y un recurso por pieza, sin argumentos.";
            case "variables.tf" -> "región y propiedades de cada recurso; las credenciales, sin valor.";
            case "openapi.yaml" -> "contrato inicial de la API REST, con un recurso de ejemplo.";
            case "service.proto" -> "contrato inicial de la API gRPC, con un servicio de ejemplo.";
            case "docker-compose.yml" -> "servicios para desarrollar en local.";
            default -> "este archivo.";
        };
    }

    /** Texto dentro de una celda o un elemento de lista de Markdown: en una línea y sin abrir tablas ni HTML. */
    private static String cell(String text) {
        return text.replaceAll("\\s+", " ").strip().replace("|", "\\|").replace("<", "&lt;").replace(">", "&gt;").replace("`", "'");
    }
}
