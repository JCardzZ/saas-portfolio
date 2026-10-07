package dev.portfolio.application.port.in;

import dev.portfolio.domain.model.CloudCatalogItemDomain;
import dev.portfolio.domain.model.CloudProviderDomain;

import java.util.List;
import java.util.Optional;

public interface CloudCatalogUseCase {

    /** @return el catálogo, ordenado por nube, categoría y nombre; solo el de una nube si se indica */
    List<CloudCatalogItemDomain> find(Optional<CloudProviderDomain> provider);

    /**
     * Añade las entradas que falten. Las que ya existen no se tocan: un coste ajustado en la
     * base de datos se conserva.
     *
     * @return cuántas se han añadido
     */
    int registerDefaults(List<CloudCatalogItemDomain> items);
}
