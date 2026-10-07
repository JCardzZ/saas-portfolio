package dev.portfolio.infrastructure.adapter.out.persistence;

import dev.portfolio.application.port.out.CloudCatalogRepositoryPort;
import dev.portfolio.domain.model.CloudCatalogItemDomain;
import dev.portfolio.domain.model.CloudProviderDomain;
import dev.portfolio.infrastructure.adapter.out.persistence.entity.CloudCatalogItemEntity;
import dev.portfolio.infrastructure.adapter.out.persistence.repository.CloudCatalogItemJpaRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Component
@RequiredArgsConstructor
public class CloudCatalogPersistenceAdapter implements CloudCatalogRepositoryPort {

    private final CloudCatalogItemJpaRepository repository;

    @Override
    @Transactional(readOnly = true)
    public List<CloudCatalogItemDomain> findAll() {
        return repository.findAllByOrderByProviderAscCategoryAscNameAsc().stream()
                .map(entity -> new CloudCatalogItemDomain(entity.getId(), CloudProviderDomain.fromCode(entity.getProvider()),
                        entity.getCode(), entity.getName(), entity.getCategory(), entity.getDefaultMonthlyCost(), entity.isEnterprise()))
                .toList();
    }

    @Override
    @Transactional
    public void saveAll(List<CloudCatalogItemDomain> items) {
        repository.saveAll(items.stream().map(item -> CloudCatalogItemEntity.builder()
                .id(item.id())
                .provider(item.provider().code())
                .code(item.code())
                .name(item.name())
                .category(item.category())
                .defaultMonthlyCost(item.defaultMonthlyCost())
                .enterprise(item.enterprise())
                .build()).toList());
    }
}
