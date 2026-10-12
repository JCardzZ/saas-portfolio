package dev.portfolio.application.service;

import dev.portfolio.testsupport.GraphRulesFixture;
import dev.portfolio.application.port.in.ArchitectureProjectUseCase.Draft;
import dev.portfolio.application.port.out.ArchitectureProjectRepositoryPort;
import dev.portfolio.domain.exception.InvalidRequestException;
import dev.portfolio.domain.exception.ResourceNotFoundException;
import dev.portfolio.domain.model.ArchitectureProjectDomain;
import dev.portfolio.domain.model.CloudProviderDomain;
import dev.portfolio.domain.model.FeatureFlagDomain;
import dev.portfolio.domain.model.GraphDiagnosticDomain;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

public class ArchitectureProjectServiceTest {

    /** Repositorio en memoria, con el mismo orden que el real: plantillas primero y después lo más reciente. */
    public static class InMemoryRepository implements ArchitectureProjectRepositoryPort {
        private final Map<String, ArchitectureProjectDomain> rows = new LinkedHashMap<>();

        @Override
        public List<ArchitectureProjectDomain> findAll() {
            return rows.values().stream()
                    .sorted(Comparator.comparing(ArchitectureProjectDomain::preset).reversed()
                            .thenComparing(ArchitectureProjectDomain::createdAt, Comparator.reverseOrder()))
                    .toList();
        }

        @Override
        public Optional<ArchitectureProjectDomain> findById(String id) {
            return Optional.ofNullable(rows.get(id));
        }

        @Override
        public ArchitectureProjectDomain save(ArchitectureProjectDomain project) {
            rows.put(project.id(), project);
            return project;
        }
    }

    private static final List<Map<String, Object>> NODES = List.of(Map.of("id", "api", "x", 556, "service", Map.of("aws", "ECS Fargate")));
    private static final List<Map<String, Object>> LINKS = List.of(Map.of("from", "api", "to", "api"));

    private final InMemoryRepository repository = new InMemoryRepository();
    private final ArchitectureProjectService service = new ArchitectureProjectService(repository, GraphRulesFixture.load(), flag -> false);

    private static Draft draft(String title) {
        return new Draft(title, "  Una descripción  ", CloudProviderDomain.AZURE, NODES, LINKS, List.of());
    }

    @Test
    void savesANewProjectAndUpdatesItKeepingItsIdentityAndDate() {
        ArchitectureProjectDomain created = service.create(draft("  Mi arquitectura  "));

        assertThat(created.id()).hasSize(36);
        assertThat(created.title()).isEqualTo("Mi arquitectura");
        assertThat(created.description()).isEqualTo("Una descripción");
        assertThat(created.preset()).isFalse();
        assertThat(service.findById(created.id())).isEqualTo(created);

        ArchitectureProjectDomain updated = service.update(created.id(), new Draft("Otra", null, CloudProviderDomain.GCP, List.of(), List.of(), List.of()));
        assertThat(updated.id()).isEqualTo(created.id());
        assertThat(updated.createdAt()).isEqualTo(created.createdAt());
        assertThat(updated.cloudProvider()).isEqualTo(CloudProviderDomain.GCP);
        assertThat(updated.description()).isNull();
        assertThat(service.findAll()).containsExactly(updated);
    }

    @Test
    void presetsAreRegisteredWithAFixedIdRefreshedInPlaceAndCannotBeEditedThroughTheApi() {
        ArchitectureProjectDomain first = service.registerPreset("core-banking", draft("Core bancario"));
        ArchitectureProjectDomain again = service.registerPreset("core-banking", draft("Core bancario v2"));

        assertThat(again.preset()).isTrue();
        assertThat(again.createdAt()).isEqualTo(first.createdAt());
        assertThat(service.findAll()).extracting(ArchitectureProjectDomain::title).containsExactly("Core bancario v2");

        assertThatThrownBy(() -> service.update("core-banking", draft("Pisada")))
                .isInstanceOf(InvalidRequestException.class).hasMessageContaining("Las plantillas no se pueden modificar");
        assertThat(service.findById("core-banking").title()).isEqualTo("Core bancario v2");
    }

    @Test
    void listsPresetsBeforeSavedProjects() {
        repository.save(new ArchitectureProjectDomain("old", "Antiguo", null, CloudProviderDomain.AWS, List.of(), List.of(), List.of(), false, Instant.parse("2026-01-01T00:00:00Z")));
        repository.save(new ArchitectureProjectDomain("new", "Reciente", null, CloudProviderDomain.AWS, List.of(), List.of(), List.of(), false, Instant.parse("2026-06-01T00:00:00Z")));
        service.registerPreset("preset", draft("Plantilla"));

        assertThat(service.findAll()).extracting(ArchitectureProjectDomain::id).containsExactly("preset", "new", "old");
    }

    @Test
    void missingProjectsAreNotFound() {
        assertThatThrownBy(() -> service.findById("nope")).isInstanceOf(ResourceNotFoundException.class);
        assertThatThrownBy(() -> service.update("nope", draft("x"))).isInstanceOf(ResourceNotFoundException.class);
    }

    @Test
    void rejectsDraftsWithoutTitleOrCloudOrWithTextsThatAreTooLong() {
        assertThatThrownBy(() -> service.create(draft("  "))).isInstanceOf(InvalidRequestException.class).hasMessage("El proyecto necesita un título");
        assertThatThrownBy(() -> service.create(draft("t".repeat(121)))).isInstanceOf(InvalidRequestException.class);
        assertThatThrownBy(() -> service.create(new Draft("ok", "d".repeat(501), CloudProviderDomain.AWS, NODES, LINKS, List.of())))
                .isInstanceOf(InvalidRequestException.class);
        assertThatThrownBy(() -> service.create(new Draft("ok", null, null, NODES, LINKS, List.of())))
                .isInstanceOf(InvalidRequestException.class).hasMessage("El proyecto necesita una nube");
        assertThat(repository.findAll()).isEmpty();
    }

    @Test
    void boundsTheGraphItStoresAndServesToEveryone() {
        List<Map<String, Object>> tooMany = Collections.nCopies(61, Map.of("id", "n"));
        Map<String, Object> deep = Map.of("id", "n", "a", Map.of("b", Map.of("c", Map.of("d", Map.of("e", Map.of("f", 1))))));
        Map<String, Object> huge = Map.of("id", "n", "why", "x".repeat(200_001));
        List<Map<String, Object>> withNull = new ArrayList<>();
        withNull.add(null);

        for (List<Map<String, Object>> nodes : List.of(tooMany, List.of(deep), List.of(huge), withNull,
                List.<Map<String, Object>>of(Map.of("id", "<script>")), List.<Map<String, Object>>of(Map.of("x", 1)),
                List.<Map<String, Object>>of(Map.of("id", "n", "raro", new Object())))) {
            assertThatThrownBy(() -> service.create(new Draft("ok", null, CloudProviderDomain.AWS, nodes, LINKS, List.of())))
                    .isInstanceOf(InvalidRequestException.class);
        }
        assertThatThrownBy(() -> service.create(new Draft("ok", null, CloudProviderDomain.AWS, NODES, null, List.of())))
                .isInstanceOf(InvalidRequestException.class);
        assertThatThrownBy(() -> service.create(new Draft("ok", null, CloudProviderDomain.AWS, NODES, LINKS, Collections.nCopies(25, Map.of()))))
                .isInstanceOf(InvalidRequestException.class);
    }
    @Test
    void refusesToSaveAGraphThatBreaksTheRulesOfTheStudio() {
        List<Map<String, Object>> nodes = List.of(Map.of("id", "api", "type", "containers"), Map.of("id", "cdc-1", "type", "cdc"));
        Draft broken = new Draft("CDC mal conectado", null, CloudProviderDomain.AWS, nodes, List.of(Map.of("from", "api", "to", "cdc-1")), List.of());

        assertThatThrownBy(() -> service.create(broken)).isInstanceOf(InvalidRequestException.class)
                .hasMessageStartingWith("Conexión no permitida: api → cdc-1");
        assertThat(service.findAll()).isEmpty();

        // Guardado bien, tampoco se puede actualizar a un grafo que las incumpla.
        ArchitectureProjectDomain saved = service.create(new Draft("CDC", null, CloudProviderDomain.AWS, nodes, List.of(), List.of()));
        assertThatThrownBy(() -> service.update(saved.id(), broken)).isInstanceOf(InvalidRequestException.class);
        assertThat(service.findById(saved.id()).connections()).isEmpty();
    }

    @Test
    void diagnosesAProjectOnlyWhileTheSmartRulesAreOn() {
        List<Map<String, Object>> nodes = List.of(Map.of("id", "users", "type", "users", "zone", "outside", "service", "Visitantes"),
                Map.of("id", "postgres", "type", "postgres", "zone", "public", "service", "RDS PostgreSQL"));
        List<Map<String, Object>> links = List.of(Map.of("from", "users", "to", "postgres"));
        ArchitectureProjectService on = new ArchitectureProjectService(repository, GraphRulesFixture.load(),
                flag -> flag == FeatureFlagDomain.STUDIO_SMART_RULES);

        assertThat(service.diagnose(nodes, links)).isEmpty();
        assertThat(on.diagnose(nodes, links)).extracting(GraphDiagnosticDomain::rule).containsExactly("exposure", "placement");
        assertThat(on.diagnose(null, null)).isEmpty();

        // Los avisos no impiden guardar: un proyecto así ya se podía guardar antes.
        assertThat(on.create(new Draft("Expuesta", null, CloudProviderDomain.AWS, nodes, links, List.of())).nodes()).hasSize(2);
    }
}
