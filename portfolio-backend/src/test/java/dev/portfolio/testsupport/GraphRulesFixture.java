package dev.portfolio.testsupport;

import com.fasterxml.jackson.databind.ObjectMapper;
import dev.portfolio.domain.model.ArchitectureGraphRules;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;

/** Las reglas del grafo reales, tal como las exporta el Estudio y las carga la aplicación. */
public final class GraphRulesFixture {

    private GraphRulesFixture() {
    }

    public static ArchitectureGraphRules load() {
        try (InputStream json = GraphRulesFixture.class.getResourceAsStream("/architecture/graph-rules.json")) {
            return new ObjectMapper().readValue(json, ArchitectureGraphRules.class);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
