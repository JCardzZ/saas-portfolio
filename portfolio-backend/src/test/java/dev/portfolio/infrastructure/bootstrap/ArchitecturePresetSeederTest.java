package dev.portfolio.infrastructure.bootstrap;

import dev.portfolio.testsupport.GraphRulesFixture;
import dev.portfolio.testsupport.SystemDesignFixture;
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
    private final ArchitectureProjectService service = new ArchitectureProjectService(repository, GraphRulesFixture.load(), flag -> false, SystemDesignFixture.rules());
    private final ArchitecturePresetSeeder seeder = new ArchitecturePresetSeeder(service, new ObjectMapper());

    @Test
    void seedsTheScenariosAndPatternsAsReadOnlyPresets() throws Exception {
        // Once escenarios y patrones, más seis sistemas de ejemplo que no se ven con su flag apagada.
        assertThat(seeder.seed()).isEqualTo(17);

        List<ArchitectureProjectDomain> presets = service.findAll();
        assertThat(presets).allMatch(ArchitectureProjectDomain::preset);
        assertThat(presets).extracting(ArchitectureProjectDomain::id).containsExactlyInAnyOrder("aks-oauth2", "legacy-core", "high-traffic",
                "event-driven", "ecommerce-cqrs", "saas-multitenant", "fintech-payments", "rag-enterprise",
                "cdc-realtime", "event-analytics", "multi-region-recovery");
        assertThat(service.findById("aks-oauth2").title()).isEqualTo("Microservicios en Kubernetes (AKS + OAuth2 + Redis)");
        assertThat(service.findById("aks-oauth2").cloudProvider()).isEqualTo(CloudProviderDomain.AZURE);
        assertThat(service.findById("legacy-core").title()).isEqualTo("Core legado integrado por colas (Mainframe + MQ + Spring Batch + Lambda + SQS)");
        assertThat(service.findById("high-traffic").title()).isEqualTo("Plataforma de alto tráfico anti-DDoS (CDN + WAF + AWS)");
        // Todas dicen que son un escenario ilustrativo, no la infraestructura de nadie.
        assertThat(presets).allSatisfy(preset -> assertThat(preset.description()).contains("no describe la infraestructura real de ninguna entidad"));
    }

    /** Los sistemas de ejemplo se siembran siempre, pero solo existen para quien pregunta con la flag encendida. */
    @Test
    void seedsTheSystemTemplatesAndShowsThemOnlyWhileTheirFlagIsOn() throws Exception {
        seeder.seed();
        ArchitectureProjectService withFlag = new ArchitectureProjectService(repository, GraphRulesFixture.load(),
                flag -> flag == dev.portfolio.domain.model.FeatureFlagDomain.STUDIO_SYSTEM_TEMPLATES, SystemDesignFixture.rules());

        assertThat(service.findAll()).noneMatch(preset -> preset.system() != null);
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> service.findById("system-fintech"))
                .isInstanceOf(dev.portfolio.domain.exception.ResourceNotFoundException.class);

        List<ArchitectureProjectDomain> systems = withFlag.findAll().stream().filter(preset -> preset.system() != null).toList();
        assertThat(systems).extracting(ArchitectureProjectDomain::id).containsExactlyInAnyOrder(
                "system-fintech", "system-ecommerce", "system-telemedicine", "system-mobility", "system-education", "system-iot");
        assertThat(systems).allMatch(ArchitectureProjectDomain::preset);
        // Todos dicen que son ficticios.
        assertThat(systems).allSatisfy(preset -> assertThat(preset.description()).contains("Ejemplo ficticio: ilustra un tipo de sistema; no describe el de ninguna empresa."));
        ArchitectureProjectDomain fintech = withFlag.findById("system-fintech");
        assertThat(fintech.system().choices()).containsEntry("auth", "oidc-managed").containsEntry("bff", "gateway");
        assertThat(fintech.system().deployments()).containsEntry("database", "postgres");
        assertThat(fintech.system().nfr().compliance()).containsExactly("pci");
        assertThat(fintech.system().nfr().availability()).isEqualTo(99.95);
        // Tal como se siembran no tienen nada que corregir: ni reglas del grafo ni del sistema.
        for (ArchitectureProjectDomain system : systems) {
            assertThat(GraphRulesFixture.load().diagnostics(system.nodes(), system.connections())).as(system.id()).isEmpty();
            assertThat(SystemDesignFixture.rules().evaluate(system.system(), system.nodes(), null, system.cloudProvider())).as(system.id()).isEmpty();
        }
    }

    @Test
    void theSeededGraphsCarryWhatTheirTitlesPromise() throws Exception {
        seeder.seed();

        assertThat(types("legacy-core")).contains("mainframe", "mq", "functions", "queue", "containers");
        assertThat(types("aks-oauth2")).contains("kubernetes", "api-gateway", "identity", "redis");
        assertThat(types("high-traffic")).contains("waf", "edge").filteredOn("postgres"::equals).hasSize(2);
        assertThat(service.findById("legacy-core").zones()).extracting(zone -> zone.get("label")).contains("Centro de datos propio");
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
        ArchitectureProjectDomain before = service.findById("high-traffic");
        repository.save(new ArchitectureProjectDomain("high-traffic", "Manipulada", null, CloudProviderDomain.GCP, List.of(), List.of(), List.of(), true, before.createdAt()));

        seeder.seed();

        assertThat(service.findAll()).hasSize(11);
        assertThat(service.findById("high-traffic")).isEqualTo(before);
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
