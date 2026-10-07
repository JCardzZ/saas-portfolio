package dev.portfolio.application.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.portfolio.application.port.out.RateLimiterPort;
import dev.portfolio.domain.exception.InvalidRequestException;
import dev.portfolio.domain.exception.RateLimitExceededException;
import dev.portfolio.domain.model.CloudProviderDomain;
import dev.portfolio.domain.model.RateLimitDecision;
import dev.portfolio.domain.model.RateLimitPolicy;
import dev.portfolio.domain.model.TerraformBundleDomain;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class TerraformGeneratorTest {

    private static final Path GOLDEN = Path.of("src/test/resources/architecture/golden");
    private static final RateLimitPolicy POLICY = new RateLimitPolicy(30, Duration.ofMinutes(1));

    private final ObjectMapper json = new ObjectMapper();
    private final RateLimiterPort rateLimiter = mock(RateLimiterPort.class);
    private final TerraformService service = new TerraformService(rateLimiter, POLICY);

    record Topology(String cloudProvider, List<Map<String, Object>> nodes, List<Map<String, Object>> connections) {
    }

    private Topology topology(String name) throws IOException {
        return json.readValue(GOLDEN.resolve(name + ".json").toFile(), new TypeReference<>() {
        });
    }

    /**
     * Cada caso lo produce el generador del frontend ({@code npm run export:presets}): el de Java
     * tiene que dar exactamente el mismo texto para la misma topología.
     */
    @ParameterizedTest
    @ValueSource(strings = {"reference", "aks-oauth2", "core-banking", "electoral", "blank",
            "event-driven", "ecommerce-cqrs", "saas-multitenant", "fintech-payments", "rag-enterprise",
            "properties-aws", "properties-gcp", "properties-azure"})
    void producesTheSameTerraformAsTheBrowserGenerator(String name) throws IOException {
        Topology topology = topology(name);
        CloudProviderDomain provider = CloudProviderDomain.fromCode(topology.cloudProvider());

        assertThat(TerraformGenerator.mainTf(topology.nodes(), topology.connections(), provider))
                .isEqualTo(Files.readString(GOLDEN.resolve(name + ".main.tf")));
        assertThat(TerraformGenerator.variablesTf(topology.nodes(), provider))
                .isEqualTo(Files.readString(GOLDEN.resolve(name + ".variables.tf")));
    }

    @Test
    void declaresCredentialsAsSensitiveWithoutCopyingTheirValue() throws IOException {
        Topology topology = topology("properties-aws");

        String variables = TerraformGenerator.variablesTf(topology.nodes(), CloudProviderDomain.AWS);

        assertThat(variables).contains("variable \"api_jwt_secret\" {\n  type      = string\n  sensitive = true\n}")
                .doesNotContain("abc");
        // Ni comillas ni interpolaciones del texto escrito por el usuario rompen el HCL.
        assertThat(variables).contains("RUTA = \"$${HOME} \\\"x\\\"\"");
        assertThat(TerraformGenerator.mainTf(topology.nodes(), topology.connections(), CloudProviderDomain.AWS))
                .contains("  # nombre: API de \"pagos\"\n  # capacidad: var.api_instance\n  # puertos: 8080, 443");
    }

    @Test
    void textWrittenByTheUserCannotAddLinesOrResources() {
        Map<String, Object> node = Map.of(
                "id", "x", "terraform", "aws_instance", "role", "rol\n}\nresource \"evil\" \"y\" {",
                "service", "EC2\nprovider \"evil\" {}", "name", "n\n# fin",
                "props", Map.of("instance", "t3\"\n}", "ports", "80\n443"));

        String main = TerraformGenerator.mainTf(List.of(node), List.of(), CloudProviderDomain.AWS);
        String variables = TerraformGenerator.variablesTf(List.of(node), CloudProviderDomain.AWS);

        assertThat(main.lines().filter(line -> line.startsWith("resource ") || line.startsWith("provider "))).hasSize(3);
        assertThat(main).contains("  # EC2 provider \"evil\" {} · rol } resource \"evil\" \"y\" {").contains("  # puertos: 80 443");
        assertThat(variables).contains("default = \"t3\\\" }\"");
    }

    @Test
    void rejectsAResourceTypeThatIsNotAnIdentifier() {
        Map<String, Object> node = Map.of("id", "x", "terraform", "aws_lb\" {}\nresource \"evil", "service", "LB", "role", "");
        given(rateLimiter.tryAcquire(any(), any())).willReturn(new RateLimitDecision(true, 30, 29, Duration.ZERO));

        assertThatThrownBy(() -> service.generate(CloudProviderDomain.AWS, List.of(node), List.of(), "1.2.3.4"))
                .isInstanceOf(InvalidRequestException.class).hasMessageContaining("Tipo de recurso de Terraform no válido en el nodo 'x'");
    }

    @Test
    void theServiceLimitsRequestsPerClientAndValidatesTheTopology() throws IOException {
        Topology reference = topology("reference");
        given(rateLimiter.tryAcquire(any(), any())).willReturn(new RateLimitDecision(true, 30, 29, Duration.ZERO));

        TerraformBundleDomain bundle = service.generate(CloudProviderDomain.AWS, reference.nodes(), reference.connections(), "1.2.3.4");
        assertThat(bundle.mainTf()).contains("resource \"aws_ecs_service\" \"api\" {");
        assertThat(bundle.variablesTf()).contains("variable \"region\" {");
        verify(rateLimiter).tryAcquire("terraform:1.2.3.4", POLICY);

        assertThatThrownBy(() -> service.generate(CloudProviderDomain.AWS, null, List.of(), "1.2.3.4")).isInstanceOf(InvalidRequestException.class);
        assertThatThrownBy(() -> service.generate(CloudProviderDomain.AWS, List.of(Map.of("sin", "id")), List.of(), "1.2.3.4"))
                .isInstanceOf(InvalidRequestException.class);

        given(rateLimiter.tryAcquire(any(), any())).willReturn(new RateLimitDecision(false, 30, 0, Duration.ofSeconds(20)));
        assertThatThrownBy(() -> service.generate(CloudProviderDomain.AWS, reference.nodes(), reference.connections(), "1.2.3.4"))
                .isInstanceOf(RateLimitExceededException.class);
    }
}
