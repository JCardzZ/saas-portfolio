package dev.portfolio.infrastructure.bootstrap;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.portfolio.application.port.in.CloudCatalogUseCase;
import dev.portfolio.domain.model.CloudCatalogItemDomain;
import dev.portfolio.domain.model.CloudProviderDomain;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import java.io.InputStream;
import java.math.BigDecimal;
import java.util.List;

/**
 * Al arrancar, añade al catálogo de servicios las entradas de {@code architecture/catalog.json}
 * que aún no existan (el archivo se genera desde el frontend con {@code npm run export:presets}).
 * No pisa las existentes: los costes ajustados en la base de datos se conservan.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class CloudCatalogSeeder implements ApplicationRunner {

    static final String CATALOG = "architecture/catalog.json";

    private final CloudCatalogUseCase catalog;
    private final ObjectMapper objectMapper;

    @Override
    public void run(ApplicationArguments args) {
        try {
            log.info("Cloud catalog ready: {} entries added", seed());
        } catch (Exception e) {
            // Sin catálogo en la base de datos el estudio usa el que lleva el frontend: no impide arrancar.
            log.error("Cloud catalog could not be seeded: {}", e.getMessage(), e);
        }
    }

    int seed() throws Exception {
        List<Entry> entries;
        try (InputStream json = new ClassPathResource(CATALOG).getInputStream()) {
            entries = objectMapper.readValue(json, new TypeReference<>() {
            });
        }
        return catalog.registerDefaults(entries.stream().map(entry -> {
            CloudProviderDomain provider = CloudProviderDomain.fromCode(entry.provider());
            return new CloudCatalogItemDomain(CloudCatalogItemDomain.idOf(provider, entry.code()), provider, entry.code(),
                    entry.name(), entry.category(), entry.defaultMonthlyCost(), entry.isEnterprise());
        }).toList());
    }

    record Entry(String id, String provider, String code, String name, String category, BigDecimal defaultMonthlyCost, boolean isEnterprise) {
    }
}
