package dev.portfolio.domain.model.system;

import dev.portfolio.domain.exception.InvalidRequestException;
import dev.portfolio.domain.model.CloudProviderDomain;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Pattern;

/**
 * El catálogo de la vista de Aplicación y las reglas de los requisitos no funcionales de un
 * diseño de sistema. Son datos ({@code architecture/system-design.json}), los mismos con los que
 * el Estudio avisa mientras se edita, y dan los mismos textos: los casos de
 * {@code architecture/system-cases.json} lo comprueban.
 *
 * @param catalog    categorías de la vista de Aplicación, con sus opciones
 * @param inputs     requisitos no funcionales numéricos y sus rangos
 * @param compliance regulaciones que se pueden marcar
 * @param rules      qué espera cada requisito del diseño
 */
public record SystemDesignRules(List<Category> catalog, List<Input> inputs, List<ComplianceOption> compliance, List<Rule> rules) {

    private static final Pattern NODE_ID = Pattern.compile("^[A-Za-z0-9_-]{1,48}$");
    /** Tope de cualquier requisito numérico: por encima no es un dato, es ruido. */
    public static final double MAX_NUMBER = 1e12;

    public record Category(String id, String name, String question, boolean optional, List<Option> options) {
        public Category {
            options = options == null ? List.of() : List.copyOf(options);
        }
    }

    /**
     * @param deploysOn   tipos de nodo de infraestructura en los que se puede desplegar; vacío si no se despliega en la nube
     * @param notDeployed por qué no se despliega, cuando no lo hace
     * @param contract    contrato que se genera para este estilo de API: {@code openapi}, {@code proto} o ninguno
     */
    public record Option(String id, String name, String summary, List<String> deploysOn, String notDeployed, String contract) {
        public Option {
            deploysOn = deploysOn == null ? List.of() : List.copyOf(deploysOn);
        }
    }

    public record Input(String field, String name, String unit, double min, double max, List<Double> choices, String help) {
    }

    public record ComplianceOption(String id, String name, String help) {
    }

    /** Un umbral sobre un requisito numérico ({@code field}, {@code op}, {@code value}) o una regulación marcada. */
    public record When(String field, String op, Double value, String compliance) {
    }

    /** Lo que la regla espera encontrar: {@code choice-in}, {@code infra-any}, {@code infra-replicated} o {@code cost-within-budget}. */
    public record Expect(String kind, String category, List<String> options, List<String> types, List<String> orAny) {
        public Expect {
            options = options == null ? List.of() : List.copyOf(options);
            types = types == null ? List.of() : List.copyOf(types);
            orAny = orAny == null ? List.of() : List.copyOf(orAny);
        }
    }

    public record Rule(String id, When when, Expect expect, String message, String suggestion) {
    }

    public SystemDesignRules {
        catalog = catalog == null ? List.of() : List.copyOf(catalog);
        inputs = inputs == null ? List.of() : List.copyOf(inputs);
        compliance = compliance == null ? List.of() : List.copyOf(compliance);
        rules = rules == null ? List.of() : List.copyOf(rules);
    }

    public Optional<Category> category(String id) {
        return catalog.stream().filter(category -> category.id().equals(id)).findFirst();
    }

    /** La opción elegida en una categoría, si hay alguna y sigue en el catálogo. */
    public Optional<Option> chosen(SystemDesignDomain design, Category category) {
        String id = design.choices().get(category.id());
        return category.options().stream().filter(option -> option.id().equals(id)).findFirst();
    }

    /**
     * Comprueba el sistema: que lo pedido tenga sentido, que cada pieza se despliegue donde puede
     * y que el diseño cumpla lo que piden los requisitos no funcionales.
     *
     * @param nodes   nodos de la vista de Infraestructura
     * @param costUsd coste mensual estimado, o {@code null} si no hay estimación
     */
    public List<SystemFindingDomain> evaluate(SystemDesignDomain design, List<Map<String, Object>> nodes, Double costUsd, CloudProviderDomain provider) {
        Map<String, Map<String, Object>> byId = new LinkedHashMap<>();
        for (Map<String, Object> node : nodes) {
            if (node != null && node.get("id") instanceof String id && node.get("type") instanceof String) {
                byId.put(id, node);
            }
        }
        List<Map<String, Object>> known = List.copyOf(byId.values());
        List<SystemFindingDomain> findings = new ArrayList<>();

        for (Input input : inputs) {
            Double value = design.nfr().value(input.field());
            if (value == null) {
                continue;
            }
            boolean closed = input.choices() != null && !input.choices().isEmpty();
            boolean allowed = closed ? input.choices().contains(value) : value >= input.min() && value <= input.max();
            if (!allowed) {
                findings.add(SystemFindingDomain.input("nfr-range", null, closed
                        ? "%s: elige uno de estos valores: %s.".formatted(input.name(), String.join(", ", input.choices().stream().map(SystemDesignRules::plain).toList()))
                        : "%s: tiene que estar entre %s y %s.".formatted(input.name(), plain(input.min()), plain(input.max())), null));
            }
        }

        for (Category category : catalog) {
            Optional<Option> choice = chosen(design, category);
            if (choice.isEmpty()) {
                if (!category.optional()) {
                    findings.add(SystemFindingDomain.input("choice-missing", category.id(), category.name() + ": falta elegir una opción.", category.question()));
                }
                continue;
            }
            Option option = choice.get();
            if (option.deploysOn().isEmpty()) {
                continue;
            }
            List<String> targets = known.stream().filter(node -> option.deploysOn().contains(node.get("type")))
                    .map(node -> nameOf(node, provider)).toList();
            String where = targets.isEmpty()
                    ? "Añade a la infraestructura una pieza donde desplegarlo."
                    : "Despliégalo en " + String.join(" o ", targets) + ".";
            String nodeId = design.deployments().get(category.id());
            Map<String, Object> node = nodeId == null ? null : byId.get(nodeId);
            if (nodeId == null) {
                findings.add(new SystemFindingDomain("deployment-pending", "deployment", SystemFindingDomain.Severity.WARNING, category.id(), null,
                        option.name() + " todavía no se despliega en ninguna pieza de la infraestructura.", where));
            } else if (node == null) {
                findings.add(new SystemFindingDomain("deployment-missing", "deployment", SystemFindingDomain.Severity.ERROR, category.id(), null,
                        option.name() + " se desplegaba en una pieza que ya no está en la infraestructura.", where));
            } else if (!option.deploysOn().contains(node.get("type"))) {
                findings.add(new SystemFindingDomain("deployment-invalid", "deployment", SystemFindingDomain.Severity.ERROR, category.id(), nodeId,
                        "%s no se puede desplegar en %s.".formatted(option.name(), nameOf(node, provider)), where));
            }
        }

        for (Rule rule : rules) {
            String value = triggered(rule, design);
            if (value == null) {
                continue;
            }
            Expect expect = rule.expect();
            Map<String, String> values = new LinkedHashMap<>();
            values.put("value", value);
            boolean met;
            switch (expect.kind()) {
                case "choice-in" -> {
                    String choice = design.choices().get(expect.category());
                    met = choice != null && expect.options().contains(choice);
                }
                case "infra-any" -> met = known.stream().anyMatch(node -> expect.types().contains(node.get("type")));
                case "infra-replicated" -> {
                    long count = known.stream().filter(node -> expect.types().contains(node.get("type"))).count();
                    met = count != 1 || known.stream().anyMatch(node -> expect.orAny().contains(node.get("type")));
                }
                case "cost-within-budget" -> {
                    Double budget = design.nfr().budgetUsd();
                    if (costUsd == null || budget == null) {
                        continue;
                    }
                    met = costUsd <= budget;
                    values.put("cost", plain(Math.round(costUsd)));
                    values.put("budget", plain(budget));
                }
                default -> {
                    continue; // una regla de una clase que esta versión no conoce no se evalúa
                }
            }
            if (!met) {
                findings.add(new SystemFindingDomain(rule.id(), "nfr", SystemFindingDomain.Severity.WARNING,
                        "choice-in".equals(expect.kind()) ? expect.category() : null, null, fill(rule.message(), values), rule.suggestion()));
            }
        }
        return findings;
    }

    /**
     * Deja el diseño en lo que el catálogo conoce, como lo guarda un proyecto.
     *
     * @throws InvalidRequestException si nombra una categoría, una opción o una regulación que no existen
     */
    public SystemDesignDomain validated(SystemDesignDomain design) {
        if (design == null) {
            throw new InvalidRequestException("Falta el diseño del sistema");
        }
        Map<String, String> choices = new LinkedHashMap<>();
        for (Map.Entry<String, String> choice : design.choices().entrySet()) {
            Category category = category(choice.getKey())
                    .orElseThrow(() -> new InvalidRequestException("Categoría de sistema desconocida: '" + choice.getKey() + "'"));
            if (category.options().stream().noneMatch(option -> option.id().equals(choice.getValue()))) {
                throw new InvalidRequestException("Opción desconocida en «%s»: '%s'".formatted(category.name(), choice.getValue()));
            }
            choices.put(choice.getKey(), choice.getValue());
        }
        Map<String, String> deployments = new LinkedHashMap<>();
        for (Map.Entry<String, String> deployment : design.deployments().entrySet()) {
            Category category = category(deployment.getKey())
                    .orElseThrow(() -> new InvalidRequestException("Categoría de sistema desconocida: '" + deployment.getKey() + "'"));
            if (deployment.getValue() == null || !NODE_ID.matcher(deployment.getValue()).matches()) {
                throw new InvalidRequestException("«%s» se despliega en un nodo con un id no válido".formatted(category.name()));
            }
            // Lo que no se despliega en la nube (una app móvil, un contrato) no guarda dónde.
            Optional<Option> option = category.options().stream().filter(candidate -> candidate.id().equals(choices.get(category.id()))).findFirst();
            if (option.isPresent() && !option.get().deploysOn().isEmpty()) {
                deployments.put(deployment.getKey(), deployment.getValue());
            }
        }
        SystemDesignDomain.NonFunctional nfr = design.nfr();
        for (Input input : inputs) {
            Double value = nfr.value(input.field());
            if (value != null && (value.isNaN() || value.isInfinite() || value < 0 || value > MAX_NUMBER)) {
                throw new InvalidRequestException(input.name() + ": no es un número válido");
            }
        }
        List<String> known = compliance.stream().map(ComplianceOption::id).toList();
        for (String regulation : nfr.compliance()) {
            if (!known.contains(regulation)) {
                throw new InvalidRequestException("Regulación desconocida: '" + regulation + "'");
            }
        }
        return new SystemDesignDomain(choices, deployments,
                new SystemDesignDomain.NonFunctional(nfr.users(), nfr.rps(), nfr.latencyMs(), nfr.availability(), nfr.budgetUsd(),
                        known.stream().filter(nfr.compliance()::contains).toList()));
    }

    /** El valor pedido que dispara la regla, como texto, o {@code null} si no se dispara. */
    private static String triggered(Rule rule, SystemDesignDomain design) {
        When when = rule.when();
        if (when.compliance() != null) {
            return design.nfr().compliance().contains(when.compliance()) ? when.compliance() : null;
        }
        Double value = design.nfr().value(when.field());
        if (value == null || when.value() == null) {
            return null;
        }
        boolean fires = ">=".equals(when.op()) ? value >= when.value() : value <= when.value();
        return fires ? plain(value) : null;
    }

    /** Nombre con el que se ve un nodo: el propio, el de su servicio en esa nube o, si no hay otro, su id. */
    public static String nameOf(Map<String, Object> node, CloudProviderDomain provider) {
        if (node.get("name") instanceof String name && !name.isBlank()) {
            return name.strip();
        }
        Object service = node.get("service");
        if (service instanceof String text && !text.isBlank()) {
            return text;
        }
        if (service instanceof Map<?, ?> byCloud && provider != null && byCloud.get(provider.code()) instanceof String text && !text.isBlank()) {
            return text;
        }
        return String.valueOf(node.get("id"));
    }

    /** Un número como se escribe en los mensajes: sin separadores, igual que en el Estudio. */
    public static String plain(double value) {
        return BigDecimal.valueOf(value).setScale(4, RoundingMode.HALF_UP).stripTrailingZeros().toPlainString();
    }

    private static String fill(String template, Map<String, String> values) {
        String text = template;
        for (Map.Entry<String, String> value : values.entrySet()) {
            text = text.replace("{" + value.getKey() + "}", value.getValue());
        }
        return text;
    }
}
