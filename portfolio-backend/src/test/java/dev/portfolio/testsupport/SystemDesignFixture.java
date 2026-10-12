package dev.portfolio.testsupport;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.portfolio.domain.model.system.SystemDesignDomain;
import dev.portfolio.domain.model.system.SystemDesignRules;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** El catálogo y las reglas del diseño de sistemas reales, tal como los exporta el Estudio y los carga la aplicación. */
public final class SystemDesignFixture {

    private SystemDesignFixture() {
    }

    public static SystemDesignRules rules() {
        try (InputStream json = SystemDesignFixture.class.getResourceAsStream("/architecture/system-design.json")) {
            return new ObjectMapper().readValue(json, SystemDesignRules.class);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    /** Un diseño escrito como lo guarda el Estudio: {@code choices}, {@code deployments} y {@code nfr}. */
    public static SystemDesignDomain design(JsonNode json) {
        JsonNode nfr = json.get("nfr");
        List<String> compliance = new ArrayList<>();
        nfr.get("compliance").forEach(entry -> compliance.add(entry.asText()));
        return new SystemDesignDomain(strings(json.get("choices")), strings(json.get("deployments")),
                new SystemDesignDomain.NonFunctional(number(nfr, "users"), number(nfr, "rps"), number(nfr, "latencyMs"),
                        number(nfr, "availability"), number(nfr, "budgetUsd"), compliance));
    }

    private static Map<String, String> strings(JsonNode node) {
        Map<String, String> values = new LinkedHashMap<>();
        node.fields().forEachRemaining(entry -> values.put(entry.getKey(), entry.getValue().asText()));
        return values;
    }

    private static Double number(JsonNode node, String field) {
        return node.hasNonNull(field) ? node.get(field).asDouble() : null;
    }
}
