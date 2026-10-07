package dev.portfolio.application.service;

import dev.portfolio.application.port.in.CloudCatalogUseCase;
import dev.portfolio.application.port.out.CachePort;
import dev.portfolio.application.port.out.CloudCatalogRepositoryPort;
import dev.portfolio.domain.model.CloudCatalogItemDomain;
import dev.portfolio.domain.model.CloudProviderDomain;

import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

public class CloudCatalogService implements CloudCatalogUseCase {

    private final CloudCatalogRepositoryPort repository;
    private final CachePort cache;

    public CloudCatalogService(CloudCatalogRepositoryPort repository, CachePort cache) {
        this.repository = repository;
        this.cache = cache;
    }

    @Override
    public List<CloudCatalogItemDomain> find(Optional<CloudProviderDomain> provider) {
        List<CloudCatalogItemDomain> all = cache.getList(CacheKeys.CLOUD_CATALOG_ALL, CloudCatalogItemDomain.class)
                .orElseGet(() -> {
                    List<CloudCatalogItemDomain> items = repository.findAll();
                    cache.put(CacheKeys.CLOUD_CATALOG_ALL, items, CacheKeys.TTL);
                    return items;
                });
        return provider.map(wanted -> all.stream().filter(item -> item.provider() == wanted).toList()).orElse(all);
    }

    @Override
    public int registerDefaults(List<CloudCatalogItemDomain> items) {
        Set<String> existing = repository.findAll().stream().map(CloudCatalogItemDomain::id).collect(Collectors.toSet());
        List<CloudCatalogItemDomain> missing = items.stream().filter(item -> !existing.contains(item.id())).toList();
        if (!missing.isEmpty()) {
            repository.saveAll(missing);
            cache.evict(CacheKeys.CLOUD_CATALOG_ALL);
        }
        return missing.size();
    }
}
