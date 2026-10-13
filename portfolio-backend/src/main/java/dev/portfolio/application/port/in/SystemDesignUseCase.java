package dev.portfolio.application.port.in;

import dev.portfolio.domain.model.CloudProviderDomain;
import dev.portfolio.domain.model.system.SystemDesignDomain;
import dev.portfolio.domain.model.system.SystemDesignRules;
import dev.portfolio.domain.model.system.SystemFindingDomain;

import java.util.List;
import java.util.Map;

/**
 * Diseño de sistemas: comprobar un sistema completo (aplicación + infraestructura + requisitos
 * no funcionales) y generar sus archivos de partida. No guarda ni aplica nada.
 */
public interface SystemDesignUseCase {

    /** El catálogo de la vista de Aplicación y los requisitos no funcionales que se pueden pedir. */
    SystemDesignRules catalog();

    /**
     * @throws dev.portfolio.domain.exception.InvalidRequestException    si el grafo o el diseño no son válidos
     * @throws dev.portfolio.domain.exception.RateLimitExceededException si el cliente ha agotado su cupo
     */
    List<SystemFindingDomain> evaluate(Request request, String clientKey);

    /**
     * Terraform de la infraestructura, contrato inicial de la API (si su estilo lo tiene),
     * {@code docker-compose.yml} y README. Son puntos de partida, no algo que desplegar tal cual.
     *
     * @throws dev.portfolio.domain.exception.InvalidRequestException    si el grafo o el diseño no son válidos
     * @throws dev.portfolio.domain.exception.RateLimitExceededException si el cliente ha agotado su cupo
     */
    Bundle generate(Request request, String clientKey);

    /**
     * Deja el diseño en lo que el catálogo conoce, como lo guarda un proyecto.
     *
     * @throws dev.portfolio.domain.exception.InvalidRequestException si nombra una categoría o una opción que no existen
     */
    SystemDesignDomain validated(SystemDesignDomain design);

    /**
     * Propone un sistema completo a partir de un encargo: parte del sistema de ejemplo que más se
     * le parece, le aplica lo que el encargo pide (nube, elecciones y requisitos), lo comprueba
     * y genera sus archivos de partida. No guarda nada.
     *
     * @throws dev.portfolio.domain.exception.InvalidRequestException    si el encargo nombra algo que el catálogo no tiene
     * @throws dev.portfolio.domain.exception.RateLimitExceededException si el cliente ha agotado su cupo
     */
    Proposal design(Brief brief, String clientKey);

    /**
     * @param provider nube pedida; {@code null} deja la del sistema de partida
     * @param template id del sistema de ejemplo del que partir; {@code null} elige el más parecido
     * @param choices  elecciones pedidas (categoría → opción); lo que no se pide queda como en el de partida
     * @param nfr      requisitos no funcionales pedidos
     */
    record Brief(CloudProviderDomain provider, String template, Map<String, String> choices, SystemDesignDomain.NonFunctional nfr) {
        public Brief {
            choices = choices == null ? Map.of() : Map.copyOf(choices);
        }
    }

    /**
     * @param template id y título del sistema de ejemplo del que se partió
     * @param adjusted categorías cuya pieza hubo que volver a desplegar al cambiar la elección
     */
    record Proposal(String template, String templateTitle, CloudProviderDomain provider, List<Map<String, Object>> nodes,
                    List<Map<String, Object>> connections, SystemDesignDomain design, List<String> adjusted, Bundle bundle) {
    }

    /** @param costUsd coste mensual estimado de la infraestructura, o {@code null} si quien pregunta no lo tiene */
    record Request(CloudProviderDomain provider, List<Map<String, Object>> nodes, List<Map<String, Object>> connections,
                   SystemDesignDomain design, Double costUsd) {
    }

    /** @param language {@code hcl}, {@code yaml}, {@code protobuf} o {@code markdown} */
    record GeneratedFile(String path, String language, String content) {
    }

    record Bundle(List<GeneratedFile> files, List<SystemFindingDomain> findings) {
    }
}
