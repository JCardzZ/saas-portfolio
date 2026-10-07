package dev.portfolio.architecture;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;

/**
 * Reglas de la arquitectura hexagonal, comprobadas sobre el código compilado. Lo que aquí falla
 * es un import en la dirección equivocada: el mensaje de ArchUnit dice qué clase y qué línea.
 */
@AnalyzeClasses(packages = "dev.portfolio", importOptions = ImportOption.DoNotIncludeTests.class)
class HexagonalArchitectureTest {

    private static final String DOMAIN = "dev.portfolio.domain..";
    private static final String APPLICATION = "dev.portfolio.application..";
    private static final String INFRASTRUCTURE = "dev.portfolio.infrastructure..";
    private static final String WEB = "dev.portfolio.infrastructure.adapter.in.web..";
    private static final String CONTROLLERS = "dev.portfolio.infrastructure.adapter.in.web.controller..";
    private static final String OUT_ADAPTERS = "dev.portfolio.infrastructure.adapter.out..";
    private static final String PERSISTENCE = "dev.portfolio.infrastructure.adapter.out.persistence..";
    private static final String ENTITIES = "dev.portfolio.infrastructure.adapter.out.persistence.entity..";
    /** Código generado del contrato OpenAPI: interfaces de los controladores y DTO. */
    private static final String[] GENERATED = {"dev.portfolio.api..", "dev.portfolio.model.."};

    // ---- Dominio y aplicación: Java puro ----

    @ArchTest
    static final ArchRule domain_and_application_do_not_use_spring = noClasses()
            .that().resideInAnyPackage(DOMAIN, APPLICATION)
            .should().dependOnClassesThat().resideInAnyPackage("org.springframework..")
            .because("los servicios de aplicación se registran como @Bean en UseCaseConfig, no con anotaciones");

    @ArchTest
    static final ArchRule domain_and_application_do_not_use_jpa = noClasses()
            .that().resideInAnyPackage(DOMAIN, APPLICATION)
            .should().dependOnClassesThat().resideInAnyPackage("jakarta.persistence..", "org.hibernate..")
            .because("la persistencia es un adaptador de salida");

    @ArchTest
    static final ArchRule domain_depends_only_on_itself_and_the_jdk = classes()
            .that().resideInAPackage(DOMAIN)
            .should().onlyDependOnClassesThat().resideInAnyPackage(DOMAIN, "java..")
            .because("el dominio no conoce ni a la aplicación ni a ninguna librería");

    @ArchTest
    static final ArchRule application_depends_only_on_the_domain_and_the_jdk = classes()
            .that().resideInAPackage(APPLICATION)
            .should().onlyDependOnClassesThat().resideInAnyPackage(APPLICATION, DOMAIN, "java..")
            .because("la aplicación habla con el exterior solo por sus puertos; MapStruct, Jackson, "
                    + "Resilience4j, las librerías de PDF y los DTO generados son cosa de la infraestructura");

    @ArchTest
    static final ArchRule nothing_inside_depends_on_infrastructure = noClasses()
            .that().resideInAnyPackage(DOMAIN, APPLICATION)
            .should().dependOnClassesThat().resideInAPackage(INFRASTRUCTURE);

    // ---- Puertos ----

    @ArchTest
    static final ArchRule ports_are_interfaces = classes()
            .that().resideInAPackage("dev.portfolio.application.port..").and().areTopLevelClasses()
            .should().beInterfaces()
            .because("un puerto es un contrato; los datos que viajan por él son del dominio o tipos anidados");

    // ---- Adaptadores de entrada ----

    @ArchTest
    static final ArchRule controllers_use_only_inbound_ports = noClasses()
            .that().resideInAPackage(CONTROLLERS)
            .should().dependOnClassesThat().resideInAnyPackage(
                    "dev.portfolio.application.service..", "dev.portfolio.application.port.out..", OUT_ADAPTERS)
            .because("los controladores solo delegan en los casos de uso");

    @ArchTest
    static final ArchRule web_layer_does_not_reach_outbound_adapters = noClasses()
            .that().resideInAPackage(WEB)
            .should().dependOnClassesThat().resideInAPackage(OUT_ADAPTERS);

    // ---- Adaptadores de salida ----

    @ArchTest
    static final ArchRule outbound_adapters_do_not_know_the_web_layer = noClasses()
            .that().resideInAPackage(OUT_ADAPTERS)
            .should().dependOnClassesThat().resideInAPackage(WEB);

    @ArchTest
    static final ArchRule outbound_adapters_do_not_use_the_generated_dtos = noClasses()
            .that().resideInAPackage(OUT_ADAPTERS)
            .should().dependOnClassesThat().resideInAnyPackage(GENERATED)
            .because("los DTO del contrato se convierten a dominio en la capa web");

    @ArchTest
    static final ArchRule jpa_entities_live_in_the_persistence_adapter = classes()
            .that().areAnnotatedWith("jakarta.persistence.Entity")
            .should().resideInAPackage(ENTITIES);

    @ArchTest
    static final ArchRule jpa_entities_do_not_leave_the_persistence_adapter = noClasses()
            .that().resideOutsideOfPackage(PERSISTENCE)
            .should().dependOnClassesThat().resideInAPackage(ENTITIES)
            .because("fuera del adaptador de persistencia solo circulan modelos de dominio");
}
