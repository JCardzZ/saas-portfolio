package dev.portfolio.domain.model.system;

import java.util.List;
import java.util.Map;

/**
 * Un sistema completo sobre un proyecto de arquitectura: lo elegido en la vista de Aplicación,
 * en qué nodo de la vista de Infraestructura se despliega cada pieza y los requisitos no
 * funcionales que se le piden.
 *
 * @param choices     opción elegida en cada categoría (id de categoría → id de opción)
 * @param deployments «se despliega en»: id de categoría → id del nodo de infraestructura
 */
public record SystemDesignDomain(Map<String, String> choices, Map<String, String> deployments, NonFunctional nfr) {

    /**
     * Requisitos no funcionales. Un valor sin dar es {@code null}: no se pide nada sobre él.
     *
     * @param compliance regulaciones marcadas: {@code pci}, {@code health}
     */
    public record NonFunctional(Double users, Double rps, Double latencyMs, Double availability, Double budgetUsd, List<String> compliance) {

        public NonFunctional {
            compliance = compliance == null ? List.of() : List.copyOf(compliance);
        }

        public static NonFunctional none() {
            return new NonFunctional(null, null, null, null, null, List.of());
        }

        /** El valor de un requisito por su nombre de campo, o {@code null} si no se ha dado o el campo no existe. */
        public Double value(String field) {
            return switch (field == null ? "" : field) {
                case "users" -> users;
                case "rps" -> rps;
                case "latencyMs" -> latencyMs;
                case "availability" -> availability;
                case "budgetUsd" -> budgetUsd;
                default -> null;
            };
        }
    }

    public SystemDesignDomain {
        choices = choices == null ? Map.of() : Map.copyOf(choices);
        deployments = deployments == null ? Map.of() : Map.copyOf(deployments);
        nfr = nfr == null ? NonFunctional.none() : nfr;
    }
}
