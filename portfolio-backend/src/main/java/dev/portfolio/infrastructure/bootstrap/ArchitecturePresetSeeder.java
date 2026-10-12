package dev.portfolio.infrastructure.bootstrap;

import dev.portfolio.domain.model.system.SystemDesignDomain;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.portfolio.application.port.in.ArchitectureProjectUseCase;
import dev.portfolio.application.port.in.ArchitectureProjectUseCase.Draft;
import dev.portfolio.domain.model.CloudProviderDomain;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import java.io.InputStream;
import java.util.List;
import java.util.Map;

/**
 * Al arrancar, deja en la base de datos las plantillas del Estudio de arquitectura que trae la
 * plataforma ({@code architecture/presets.json}), creándolas o poniéndolas al día. Ese archivo
 * se genera desde el frontend, que es donde se dibujan ({@code npm run export:presets}).
 * Son escenarios ilustrativos: no describen la infraestructura real de ninguna entidad.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ArchitecturePresetSeeder implements ApplicationRunner {

    static final String PRESETS = "architecture/presets.json";

    private final ArchitectureProjectUseCase projects;
    private final ObjectMapper objectMapper;

    @Override
    public void run(ApplicationArguments args) {
        try {
            int count = seed();
            log.info("Architecture presets ready: {}", count);
        } catch (Exception e) {
            // Sin plantillas el estudio sigue funcionando con las que lleva el frontend: no impide arrancar.
            log.error("Architecture presets could not be seeded: {}", e.getMessage(), e);
        }
    }

    int seed() throws Exception {
        List<Preset> presets;
        try (InputStream json = new ClassPathResource(PRESETS).getInputStream()) {
            presets = objectMapper.readValue(json, new TypeReference<>() {
            });
        }
        for (Preset preset : presets) {
            projects.registerPreset(preset.id(), new Draft(preset.title(), preset.description(),
                    CloudProviderDomain.fromCode(preset.cloudProvider()), preset.nodes(), preset.connections(), preset.zones(), preset.system()));
        }
        return presets.size();
    }

    record Preset(String id, String title, String description, String cloudProvider,
                  List<Map<String, Object>> nodes, List<Map<String, Object>> connections, List<Map<String, Object>> zones,
                  SystemDesignDomain system) {
    }
}
