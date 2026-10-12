package dev.portfolio.infrastructure.adapter.in.mcp;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import dev.portfolio.application.port.in.ArchitectureProjectUseCase;
import dev.portfolio.application.port.in.PricingUseCase;
import dev.portfolio.application.port.in.RAGUseCase;
import dev.portfolio.application.port.in.SystemDesignUseCase;
import dev.portfolio.application.port.in.TerraformUseCase;
import dev.portfolio.testsupport.SystemDesignFixture;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.mock;

/**
 * El contrato de las herramientas MCP: nombre, versión, clase y esquemas de cada una, tal como
 * los ve un cliente. Está guardado en {@code src/test/resources/mcp/tools-contract.json}; si una
 * herramienta cambia, este test falla hasta que se sube su versión y se regenera el archivo:
 * <pre>MCP_CONTRACT_UPDATE=true ./gradlew test --tests "*McpToolContractTest"</pre>
 */
class McpToolContractTest {

    private static final ObjectMapper JSON = new ObjectMapper().enable(SerializationFeature.INDENT_OUTPUT)
            .enable(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS);
    private static final Path CONTRACT = Path.of("src/test/resources/mcp/tools-contract.json");

    private static List<McpTool> tools() {
        SystemDesignUseCase systemDesign = mock(SystemDesignUseCase.class);
        given(systemDesign.catalog()).willReturn(SystemDesignFixture.rules());
        return PortfolioTools.all(mock(ArchitectureProjectUseCase.class), mock(TerraformUseCase.class), mock(PricingUseCase.class),
                mock(RAGUseCase.class), systemDesign);
    }

    private static Map<String, Object> describe(McpTool tool) {
        Map<String, Object> contract = new LinkedHashMap<>();
        contract.put("name", tool.name());
        contract.put("version", tool.version());
        contract.put("kind", tool.kind().name());
        contract.put("inputSchema", tool.inputSchema());
        contract.put("outputSchema", tool.outputSchema());
        return contract;
    }

    @Test
    void theToolsAreTheOnesPublishedWithTheirVersionsAndSchemas() throws IOException {
        JsonNode current = JSON.valueToTree(tools().stream().map(McpToolContractTest::describe).toList());
        if ("true".equals(System.getenv("MCP_CONTRACT_UPDATE"))) {
            Files.createDirectories(CONTRACT.getParent());
            Files.writeString(CONTRACT, JSON.writeValueAsString(current) + "\n");
        }
        try (InputStream stored = getClass().getResourceAsStream("/mcp/tools-contract.json")) {
            assertThat(stored).as("falta el contrato guardado: genera src/test/resources/mcp/tools-contract.json").isNotNull();
            JsonNode published = JSON.readTree(stored);

            assertThat(published.size()).isEqualTo(current.size());
            for (int index = 0; index < current.size(); index++) {
                JsonNode tool = current.get(index);
                JsonNode before = published.get(index);
                String name = tool.get("name").asText();
                assertThat(before.get("name").asText()).as("las herramientas no cambian de nombre ni de orden").isEqualTo(name);
                if (!tool.equals(before)) {
                    assertThat(tool.get("version").asText())
                            .as("el contrato de «%s» ha cambiado: sube su versión y regenera tools-contract.json", name)
                            .isNotEqualTo(before.get("version").asText());
                }
            }
            assertThat(current).as("el contrato guardado está al día (regenéralo tras subir una versión)").isEqualTo(published);
        }
    }

    @Test
    void everyToolDeclaresWhatItNeedsAndNothingWrites() {
        List<McpTool> tools = tools();

        assertThat(tools).extracting(McpTool::name).containsExactly(
                "listar_plantillas", "validar_arquitectura", "generar_terraform", "estimar_costos", "preguntar_portafolio", "disenar_sistema");
        for (McpTool tool : tools) {
            assertThat(tool.version()).as(tool.name()).matches("\\d+\\.\\d+\\.\\d+");
            assertThat(tool.name()).as(tool.name()).matches("[a-z_]{3,40}");
            assertThat(tool.inputSchema()).as(tool.name()).containsEntry("type", "object").containsKey("properties");
            assertThat(tool.outputSchema()).as(tool.name()).containsEntry("type", "object");
            // Leer o generar: no hay una tercera clase. Ninguna herramienta guarda ni aplica.
            assertThat(tool.kind()).as(tool.name()).isIn(McpTool.Kind.READ, McpTool.Kind.GENERATE);
            assertThat(tool.description().toLowerCase()).as(tool.name()).doesNotContain("guarda el").doesNotContain("aplica el");
        }
        assertThat(tools).filteredOn(tool -> tool.kind() == McpTool.Kind.GENERATE).extracting(McpTool::name)
                .containsExactly("generar_terraform", "disenar_sistema");
    }
}
