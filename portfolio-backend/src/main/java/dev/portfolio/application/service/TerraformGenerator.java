package dev.portfolio.application.service;

import dev.portfolio.domain.exception.InvalidRequestException;
import dev.portfolio.domain.model.CloudProviderDomain;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeSet;
import java.util.regex.Pattern;

/**
 * Compila el esqueleto de Terraform de una topología del Estudio de arquitectura: los
 * proveedores necesarios, la red y un recurso por nodo, con {@code depends_on} según las
 * conexiones. Es un esqueleto: no lleva los argumentos de cada recurso y no se puede aplicar.
 * <p>
 * Produce exactamente el mismo texto que el generador del navegador
 * ({@code terraform-generator.ts}), que muestra el código en vivo; los casos de
 * {@code src/test/resources/architecture/golden} lo comprueban. Al cambiar uno hay que cambiar
 * el otro y regenerar esos casos ({@code npm run export:presets}).
 */
final class TerraformGenerator {

    private static final Map<String, String> PROVIDER_SOURCES = Map.of(
            "aws", "hashicorp/aws",
            "google", "hashicorp/google",
            "azurerm", "hashicorp/azurerm",
            "azuread", "hashicorp/azuread",
            "cloudflare", "cloudflare/cloudflare",
            "helm", "hashicorp/helm",
            "vault", "hashicorp/vault",
            "datadog", "DataDog/datadog",
            "mongodbatlas", "mongodb/mongodbatlas",
            "elasticstack", "elastic/elasticstack");

    private static final Map<CloudProviderDomain, List<String>> PROVIDER_BLOCK = Map.of(
            CloudProviderDomain.AWS, List.of("provider \"aws\" {", "  region = var.region", "}"),
            CloudProviderDomain.GCP, List.of("provider \"google\" {", "  project = var.project", "  region  = var.region", "}"),
            CloudProviderDomain.AZURE, List.of("provider \"azurerm\" {", "  features {}", "}"));

    private static final Pattern RESOURCE_TYPE = Pattern.compile("^[a-z0-9_]{1,80}$");
    private static final Pattern ENV_KEY = Pattern.compile("^[A-Za-z_][A-Za-z0-9_]*$");
    private static final Pattern SECRET_KEY =
            Pattern.compile("secret|password|passwd|token|api_?key|private_?key|credential", Pattern.CASE_INSENSITIVE);
    private static final Pattern WHITESPACE = Pattern.compile("(?U)\\s+");
    private static final Pattern NOT_IDENTIFIER = Pattern.compile("[^a-zA-Z0-9]+");

    private TerraformGenerator() {
    }

    private record Resource(Map<String, Object> node, String type, String name) {
    }

    static String mainTf(List<Map<String, Object>> nodes, List<Map<String, Object>> connections, CloudProviderDomain provider) {
        List<Resource> resources = resources(nodes, provider);
        Map<String, Resource> byId = new LinkedHashMap<>();
        resources.forEach(resource -> byId.put(text(resource.node(), "id"), resource));

        TreeSet<String> prefixes = new TreeSet<>();
        prefixes.add(prefix(provider.networkResource()));
        resources.forEach(resource -> prefixes.add(prefix(resource.type())));

        List<String> lines = new ArrayList<>(List.of(
                "# main.tf — esqueleto generado desde el lienzo (" + provider.displayName() + ")",
                "# Ilustrativo: faltan los argumentos de cada recurso; no se puede aplicar tal cual.",
                "",
                "terraform {",
                "  required_providers {"));
        for (String prefix : prefixes) {
            lines.add("    " + prefix + " = { source = \"" + PROVIDER_SOURCES.getOrDefault(prefix, "hashicorp/" + prefix) + "\" }");
        }
        lines.addAll(List.of("  }", "}", ""));
        lines.addAll(PROVIDER_BLOCK.get(provider));
        lines.addAll(List.of(
                "",
                "resource \"" + provider.networkResource() + "\" \"main\" {",
                "  # " + provider.network() + " · red privada con subred pública y subredes privadas",
                "}"));

        for (Resource resource : resources) {
            String id = text(resource.node(), "id");
            List<String> dependencies = connections.stream()
                    .filter(link -> id.equals(link.get("from")))
                    .map(link -> byId.get(link.get("to") instanceof String to ? to : ""))
                    .filter(target -> target != null)
                    .map(target -> target.type() + "." + target.name())
                    .toList();
            lines.add("");
            lines.add("resource \"" + resource.type() + "\" \"" + resource.name() + "\" {");
            lines.add("  # " + oneLine(forProvider(resource.node().get("service"), provider)) + " · " + oneLine(text(resource.node(), "role")));
            lines.addAll(propertyLines(resource));
            if (!dependencies.isEmpty()) {
                lines.add("  depends_on = [" + String.join(", ", dependencies) + "]");
            }
            lines.add("}");
        }

        List<String> unmanaged = nodes.stream().filter(node -> node.get("terraform") == null)
                .map(node -> oneLine(forProvider(node.get("service"), provider))).toList();
        if (!unmanaged.isEmpty()) {
            lines.add("");
            lines.add("# Fuera de Terraform: " + String.join(", ", unmanaged));
        }
        return String.join("\n", lines);
    }

    /**
     * La región y, por cada recurso con propiedades, su capacidad y sus variables de entorno.
     * Las que parecen credenciales se declaran {@code sensitive} y sin valor: lo que venga
     * escrito en la topología no se copia al archivo.
     */
    static String variablesTf(List<Map<String, Object>> nodes, CloudProviderDomain provider) {
        List<String> lines = new ArrayList<>(List.of(
                "# variables.tf — generado desde el lienzo (" + provider.displayName() + ")",
                "",
                "variable \"region\" {",
                "  type    = string",
                "  default = \"" + provider.defaultRegion() + "\"",
                "}"));
        if (provider == CloudProviderDomain.GCP) {
            lines.addAll(List.of("", "variable \"project\" {", "  type        = string",
                    "  description = \"Id del proyecto de Google Cloud\"", "}"));
        }

        for (Resource resource : resources(nodes, provider)) {
            Map<String, Object> props = props(resource.node());
            String instance = text(props, "instance").strip();
            if (!instance.isEmpty()) {
                lines.addAll(List.of("", "variable \"" + resource.name() + "_instance\" {", "  type    = string",
                        "  default = \"" + hcl(instance) + "\"", "}"));
            }
            List<String[]> env = parseEnv(text(props, "env"));
            List<String[]> plain = env.stream().filter(entry -> !SECRET_KEY.matcher(entry[0]).find()).toList();
            if (!plain.isEmpty()) {
                lines.addAll(List.of("", "variable \"" + resource.name() + "_env\" {", "  type = map(string)", "  default = {"));
                plain.forEach(entry -> lines.add("    " + entry[0] + " = \"" + hcl(entry[1]) + "\""));
                lines.addAll(List.of("  }", "}"));
            }
            env.stream().filter(entry -> SECRET_KEY.matcher(entry[0]).find()).forEach(entry -> lines.addAll(List.of(
                    "", "variable \"" + resource.name() + "_" + entry[0].toLowerCase() + "\" {", "  type      = string", "  sensitive = true", "}")));
        }
        return String.join("\n", lines);
    }

    /** Los nodos que se aprovisionan con Terraform, con su tipo de recurso en esa nube y su nombre local. */
    private static List<Resource> resources(List<Map<String, Object>> nodes, CloudProviderDomain provider) {
        List<Resource> resources = new ArrayList<>();
        for (Map<String, Object> node : nodes) {
            if (node.get("terraform") == null) {
                continue;
            }
            String type = forProvider(node.get("terraform"), provider);
            if (!RESOURCE_TYPE.matcher(type).matches()) {
                throw new InvalidRequestException("Tipo de recurso de Terraform no válido en el nodo '" + text(node, "id") + "'");
            }
            resources.add(new Resource(node, type, NOT_IDENTIFIER.matcher(text(node, "id")).replaceAll("_")));
        }
        return resources;
    }

    /** Lo definido en el panel de propiedades del nodo, como comentarios del recurso. */
    private static List<String> propertyLines(Resource resource) {
        Map<String, Object> props = props(resource.node());
        List<String[]> env = parseEnv(text(props, "env"));
        List<String> lines = new ArrayList<>();
        String label = text(resource.node(), "name");
        if (!label.isEmpty()) {
            lines.add("  # nombre: " + oneLine(label));
        }
        if (!text(props, "instance").strip().isEmpty()) {
            lines.add("  # capacidad: var." + resource.name() + "_instance");
        }
        if (!text(props, "ports").strip().isEmpty()) {
            lines.add("  # puertos: " + oneLine(text(props, "ports")));
        }
        if (!env.isEmpty()) {
            lines.add("  # entorno: var." + resource.name() + "_env (" + String.join(", ", env.stream().map(entry -> entry[0]).toList()) + ")");
        }
        return lines;
    }

    /** Variables de entorno escritas como {@code CLAVE=valor}, una por línea; lo que no encaja se ignora. */
    static List<String[]> parseEnv(String text) {
        List<String[]> entries = new ArrayList<>();
        for (String line : text.split("\\r?\\n", -1)) {
            int separator = line.indexOf('=');
            String key = (separator < 0 ? line : line.substring(0, separator)).strip();
            if (ENV_KEY.matcher(key).matches()) {
                entries.add(new String[] {key, separator < 0 ? "" : line.substring(separator + 1).strip()});
            }
        }
        return entries;
    }

    /** Valor de un campo que puede ser único o distinto en cada nube. */
    private static String forProvider(Object value, CloudProviderDomain provider) {
        if (value instanceof String text) {
            return text;
        }
        return value instanceof Map<?, ?> map && map.get(provider.code()) instanceof String text ? text : "";
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> props(Map<String, Object> node) {
        return node.get("props") instanceof Map<?, ?> props ? (Map<String, Object>) props : Map.of();
    }

    private static String text(Map<String, Object> map, String key) {
        return map.get(key) instanceof String text ? text : "";
    }

    private static String prefix(String resourceType) {
        return resourceType.split("_")[0];
    }

    private static String oneLine(String text) {
        return WHITESPACE.matcher(text).replaceAll(" ").strip();
    }

    /** Texto dentro de una cadena HCL: sin saltos de línea, comillas ni interpolaciones. */
    private static String hcl(String text) {
        return oneLine(text).replace("\\", "\\\\").replace("\"", "\\\"").replace("${", "$${").replace("%{", "%%{");
    }
}
