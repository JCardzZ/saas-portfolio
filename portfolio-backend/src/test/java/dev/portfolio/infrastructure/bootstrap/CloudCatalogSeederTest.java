package dev.portfolio.infrastructure.bootstrap;

import com.fasterxml.jackson.databind.ObjectMapper;
import dev.portfolio.application.port.in.CloudCatalogUseCase;
import dev.portfolio.application.port.out.CachePort;
import dev.portfolio.application.port.out.CloudCatalogRepositoryPort;
import dev.portfolio.application.service.CloudCatalogService;
import dev.portfolio.domain.model.CloudCatalogItemDomain;
import dev.portfolio.domain.model.CloudProviderDomain;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

class CloudCatalogSeederTest {

    /** Repositorio en memoria con el orden del real: nube, categoría y nombre. */
    static class InMemoryCatalog implements CloudCatalogRepositoryPort {
        final List<CloudCatalogItemDomain> rows = new ArrayList<>();
        int reads;

        @Override
        public List<CloudCatalogItemDomain> findAll() {
            reads++;
            return rows.stream().sorted(Comparator.comparing((CloudCatalogItemDomain item) -> item.provider().code())
                    .thenComparing(CloudCatalogItemDomain::category).thenComparing(CloudCatalogItemDomain::name)).toList();
        }

        @Override
        public void saveAll(List<CloudCatalogItemDomain> items) {
            rows.addAll(items);
        }
    }

    private final InMemoryCatalog repository = new InMemoryCatalog();
    private final CachePort cache = mock(CachePort.class);
    private final CloudCatalogService service = new CloudCatalogService(repository, cache);
    private final CloudCatalogSeeder seeder = new CloudCatalogSeeder(service, new ObjectMapper());

    @BeforeEach
    void cacheIsEmpty() {
        given(cache.getList(any(), any())).willReturn(Optional.empty());
    }

    @Test
    void seedsOneEntryPerServiceAndCloud() throws Exception {
        assertThat(seeder.seed()).isEqualTo(132);

        List<CloudCatalogItemDomain> all = service.find(Optional.empty());
        assertThat(all).hasSize(132);
        assertThat(all).extracting(CloudCatalogItemDomain::provider).containsOnly(CloudProviderDomain.values());
        assertThat(service.find(Optional.of(CloudProviderDomain.GCP))).hasSize(44).allMatch(item -> item.provider() == CloudProviderDomain.GCP);

        // La misma clase de servicio, con su nombre en cada nube.
        assertThat(all).filteredOn(item -> item.code().equals("api-gateway")).extracting(CloudCatalogItemDomain::name)
                .containsExactly("Amazon API Gateway", "API Management", "Apigee");
        CloudCatalogItemDomain apigee = all.stream().filter(item -> item.id().equals("gcp:api-gateway")).findFirst().orElseThrow();
        assertThat(apigee.category()).isEqualTo("api-management");
        assertThat(apigee.defaultMonthlyCost()).isEqualByComparingTo("365");
        assertThat(apigee.enterprise()).isTrue();
        assertThat(all).filteredOn(item -> item.code().equals("functions")).noneMatch(CloudCatalogItemDomain::enterprise);
    }

    @Test
    void seedingAgainAddsOnlyWhatIsMissingAndKeepsCostsAdjustedInTheDatabase() throws Exception {
        seeder.seed();
        CloudCatalogItemDomain lambda = repository.rows.stream().filter(item -> item.id().equals("aws:functions")).findFirst().orElseThrow();
        repository.rows.remove(lambda);
        repository.rows.add(new CloudCatalogItemDomain(lambda.id(), lambda.provider(), lambda.code(), "Lambda", lambda.category(), new BigDecimal("9.50"), false));
        repository.rows.removeIf(item -> item.id().equals("azure:queue"));

        assertThat(seeder.seed()).isEqualTo(1);

        assertThat(repository.rows).hasSize(132);
        assertThat(repository.rows).filteredOn(item -> item.id().equals("aws:functions")).extracting(CloudCatalogItemDomain::defaultMonthlyCost)
                .containsExactly(new BigDecimal("9.50"));
    }

    @Test
    void theCatalogIsReadThroughTheCacheAndTheCacheIsDroppedWhenEntriesAreAdded() throws Exception {
        seeder.seed();
        verify(cache).evict("portfolio:cloud-catalog:all");
        int readsAfterSeeding = repository.reads;

        // Fallo de caché: se lee de la base de datos y se repuebla.
        assertThat(service.find(Optional.empty())).hasSize(132);
        verify(cache).put(any(), any(), any());
        assertThat(repository.reads).isEqualTo(readsAfterSeeding + 1);

        // Acierto: no se toca la base de datos.
        List<CloudCatalogItemDomain> cached = List.of(repository.rows.get(0));
        given(cache.getList("portfolio:cloud-catalog:all", CloudCatalogItemDomain.class)).willReturn(Optional.of(cached));
        assertThat(service.find(Optional.empty())).isEqualTo(cached);
        assertThat(repository.reads).isEqualTo(readsAfterSeeding + 1);

        // Sembrar sin nada nuevo no invalida la caché.
        given(cache.getList(any(), any())).willReturn(Optional.empty());
        seeder.seed();
        verify(cache, times(1)).evict(any());
    }

    @Test
    void aFailureWhileSeedingDoesNotPreventTheApplicationFromStarting() {
        CloudCatalogUseCase failing = mock(CloudCatalogUseCase.class);
        given(failing.registerDefaults(any())).willThrow(new IllegalStateException("sin base de datos"));

        assertThatCode(() -> new CloudCatalogSeeder(failing, new ObjectMapper()).run(null)).doesNotThrowAnyException();
        verify(failing, never()).find(any());
    }
}
