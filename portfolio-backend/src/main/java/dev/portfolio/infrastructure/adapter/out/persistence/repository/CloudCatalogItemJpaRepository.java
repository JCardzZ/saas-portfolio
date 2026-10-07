package dev.portfolio.infrastructure.adapter.out.persistence.repository;

import dev.portfolio.infrastructure.adapter.out.persistence.entity.CloudCatalogItemEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface CloudCatalogItemJpaRepository extends JpaRepository<CloudCatalogItemEntity, String> {

    List<CloudCatalogItemEntity> findAllByOrderByProviderAscCategoryAscNameAsc();
}
