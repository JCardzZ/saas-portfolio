package dev.portfolio.infrastructure.bootstrap;

import com.fasterxml.jackson.databind.ObjectMapper;
import dev.portfolio.application.port.in.ArchitectureProjectUseCase;
import dev.portfolio.application.service.ArchitectureProjectService;
import dev.portfolio.application.service.ArchitectureProjectServiceTest.InMemoryRepository;
import dev.portfolio.domain.model.ArchitectureProjectDomain;
import dev.portfolio.domain.model.CloudProviderDomain;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.mock;

class ArchitecturePresetSeederTest {

    private final InMemoryRepository repository = new InMemoryRepository();
    private final ArchitectureProjectService service = new ArchitectureProjectService(repository);
    private final ArchitecturePresetSeeder seeder = new ArchitecturePresetSeeder(service, new ObjectMapper());

    @Test
    void seedsTheScenariosAndPatternsAsReadOnlyPresets() throws Exception {
        assertThat(seeder.seed()).isEqualTo(8);

        List<ArchitectureProjectDomain> presets = service.findAll();
        assertThat(presets).allMatch(ArchitectureProjectDomain::preset);
        assertThat(presets).extracting(ArchitectureProjectDomain::id).containsExactlyInAnyOrder("aks-oauth2", "core-banking", "electoral",
                "event-driven", "ecommerce-cqrs", "saas-multitenant", "fintech-payments", "rag-enterprise");
        assertThat(service.findById("aks-oauth2").title()).isEqualTo("Modernización bancaria (AKS + OAuth2 + Redis)");
        assertThat(service.findById("aks-oauth2").cloudProvider()).isEqualTo(CloudProviderDomain.AZURE);
        assertThat(service.findById("core-banking").title()).isEqualTo("Core bancario AS400 (IBM MQ + Spring Batch + AWS Lambda + SQS)");
        assertThat(service.findById("electoral").title()).isEqualTo("Plataforma electoral anti-DDoS");
        // Todas dicen que son un escenario ilustrativo, no la infraestructura de nadie.
        assertThat(presets).allSatisfy(preset -> assertThat(preset.description()).contains("no describe la infraestructura real de ninguna entidad"));
    }

    @Test
    void theSeededGraphsCarryWhatTheirTitlesPromise() throws Exception {
        seeder.seed();

        assertThat(types("core-banking")).contains("mainframe", "mq", "functions", "queue", "containers");
        assertThat(types("aks-oauth2")).contains("kubernetes", "api-gateway", "identity", "redis");
        assertThat(types("electoral")).contains("waf", "edge").filteredOn("postgres"::equals).hasSize(2);
        assertThat(service.findById("core-banking").zones()).extracting(zone -> zone.get("label")).contains("Centro de datos propio");
        assertThat(types("event-driven")).contains("streaming", "nosql");
        assertThat(types("ecommerce-cqrs")).contains("streaming", "search").filteredOn("newsql-pg"::equals).hasSize(2);
        assertThat(types("saas-multitenant")).contains("api-gateway", "identity", "postgres");
        assertThat(types("fintech-payments")).contains("vault", "streaming", "waf", "redis");
        assertThat(types("rag-enterprise")).contains("ml-platform", "postgres", "redis", "bucket");
        assertThat(service.findById("rag-enterprise").title()).isEqualTo("Sistema RAG Enterprise & Vector Search (Spring Boot + pgvector + Redis + LLM API)");
        assertThat(service.findAll()).allSatisfy(preset -> assertThat(preset.title().length()).isLessThanOrEqualTo(120));
    }

    @Test
    void seedingAgainRefreshesThePresetsWithoutDuplicatingThem() throws Exception {
        seeder.seed();
        ArchitectureProjectDomain before = service.findById("electoral");
        repository.save(new ArchitectureProjectDomain("electoral", "Manipulada", null, CloudProviderDomain.GCP, List.of(), List.of(), List.of(), true, before.createdAt()));

        seeder.seed();

        assertThat(service.findAll()).hasSize(8);
        assertThat(service.findById("electoral")).isEqualTo(before);
    }

    @Test
    void aFailureWhileSeedingDoesNotPreventTheApplicationFromStarting() {
        ArchitectureProjectUseCase failing = mock(ArchitectureProjectUseCase.class);
        given(failing.registerPreset(any(), any())).willThrow(new IllegalStateException("sin base de datos"));

        assertThatCode(() -> new ArchitecturePresetSeeder(failing, new ObjectMapper()).run(null)).doesNotThrowAnyException();
    }

    private List<Object> types(String id) {
        return service.findById(id).nodes().stream().map((Map<String, Object> node) -> node.get("type")).toList();
    }
}
