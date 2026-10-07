package dev.portfolio.application.port.out;

import dev.portfolio.domain.model.CloudCatalogItemDomain;

import java.util.List;

public interface CloudCatalogRepositoryPort {

    /** @return todas las entradas, ordenadas por nube, categoría y nombre */
    List<CloudCatalogItemDomain> findAll();

    void saveAll(List<CloudCatalogItemDomain> items);
}
