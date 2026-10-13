package dev.portfolio.infrastructure.adapter.out.persistence;

import com.fasterxml.jackson.databind.ObjectMapper;
import dev.portfolio.domain.model.ArchitectureProjectDomain;
import dev.portfolio.domain.model.CloudProviderDomain;
import dev.portfolio.domain.model.system.SystemDesignDomain;
import dev.portfolio.infrastructure.adapter.out.persistence.entity.ArchitectureProjectEntity;
import dev.portfolio.infrastructure.adapter.out.persistence.repository.ArchitectureProjectJpaRepository;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.AdditionalAnswers.returnsFirstArg;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class ArchitectureProjectPersistenceAdapterTest {

    private final ArchitectureProjectJpaRepository repository = mock(ArchitectureProjectJpaRepository.class);
    private final ArchitectureProjectPersistenceAdapter adapter = new ArchitectureProjectPersistenceAdapter(repository, new ObjectMapper());

    @Test
    void storesTheGraphAsJsonAndReadsItBackUnchanged() {
        given(repository.save(any())).will(returnsFirstArg());
        ArchitectureProjectDomain project = new ArchitectureProjectDomain("id-1", "Título", null, CloudProviderDomain.AZURE,
                List.of(Map.of("id", "api", "x", 556, "service", Map.of("aws", "ECS"), "props", Map.of("env", "A=1\nB=\"2\""))),
                List.of(Map.of("from", "api")), List.of(), true, Instant.parse("2026-10-05T12:00:00Z"));

        ArchitectureProjectDomain saved = adapter.save(project);

        ArgumentCaptor<ArchitectureProjectEntity> entity = ArgumentCaptor.forClass(ArchitectureProjectEntity.class);
        verify(repository).save(entity.capture());
        assertThat(entity.getValue().getCloudProvider()).isEqualTo("azure");
        assertThat(entity.getValue().getConnectionsJson()).isEqualTo("[{\"from\":\"api\"}]");
        assertThat(entity.getValue().getZonesJson()).isEqualTo("[]");
        assertThat(entity.getValue().getNodesJson()).contains("\"x\":556").contains("A=1\\nB=\\\"2\\\"");
        assertThat(entity.getValue().isPreset()).isTrue();
        assertThat(entity.getValue().getUpdatedAt()).isNotNull();
        assertThat(saved).isEqualTo(project);

        given(repository.findById("id-1")).willReturn(Optional.of(entity.getValue()));
        assertThat(adapter.findById("id-1")).contains(project);
        given(repository.findAllByOrderByPresetDescCreatedAtDesc()).willReturn(List.of(entity.getValue()));
        assertThat(adapter.findAll()).containsExactly(project);
    }

    /** El diseño de sistema va en su propia columna; un proyecto que no lo tiene (todos los anteriores) la deja a NULL. */
    @Test
    void storesTheSystemDesignWhenThereIsOneAndNothingWhenThereIsNot() {
        given(repository.save(any())).will(returnsFirstArg());
        SystemDesignDomain system = new SystemDesignDomain(Map.of("backend", "go", "database", "postgresql"), Map.of("backend", "api"),
                new SystemDesignDomain.NonFunctional(null, 800.0, null, 99.9, null, List.of("pci")));
        ArchitectureProjectDomain project = new ArchitectureProjectDomain("id-2", "Con sistema", null, CloudProviderDomain.AWS,
                List.of(Map.of("id", "api")), List.of(), List.of(), system, false, Instant.parse("2026-10-11T12:00:00Z"));

        ArchitectureProjectDomain saved = adapter.save(project);

        ArgumentCaptor<ArchitectureProjectEntity> entity = ArgumentCaptor.forClass(ArchitectureProjectEntity.class);
        verify(repository).save(entity.capture());
        assertThat(entity.getValue().getSystemJson()).contains("\"backend\":\"go\"").contains("\"rps\":800.0").contains("\"compliance\":[\"pci\"]");
        assertThat(saved.system()).isEqualTo(system);
        given(repository.findById("id-2")).willReturn(Optional.of(entity.getValue()));
        assertThat(adapter.findById("id-2")).contains(project);

        // Una fila de antes de la migración V8.
        ArchitectureProjectEntity old = ArchitectureProjectEntity.builder().id("old").title("Antiguo").cloudProvider("aws")
                .nodesJson("[]").connectionsJson("[]").zonesJson("[]").createdAt(Instant.parse("2026-10-01T00:00:00Z")).updatedAt(Instant.now()).build();
        given(repository.findById("old")).willReturn(Optional.of(old));
        assertThat(adapter.findById("old").orElseThrow().system()).isNull();
    }
}
