package dev.portfolio.testsupport;

import com.fasterxml.jackson.databind.ObjectMapper;
import dev.portfolio.application.port.in.CloudCatalogUseCase;
import dev.portfolio.application.port.in.PricingUseCase;
import dev.portfolio.application.port.in.ProjectUseCase;
import dev.portfolio.application.port.in.RAGUseCase;
import dev.portfolio.application.port.out.RateLimiterPort;
import dev.portfolio.application.service.ArchitectureProjectService;
import dev.portfolio.application.service.ArchitectureProjectServiceTest.InMemoryRepository;
import dev.portfolio.application.service.McpAccessService;
import dev.portfolio.application.service.SystemDesignService;
import dev.portfolio.application.service.TerraformService;
import dev.portfolio.domain.model.CloudProviderDomain;
import dev.portfolio.domain.model.RAGAnswerDomain;
import dev.portfolio.domain.model.RateLimitDecision;
import dev.portfolio.domain.model.RateLimitPolicy;
import dev.portfolio.domain.model.pricing.Money;
import dev.portfolio.domain.model.pricing.PriceQuote;
import dev.portfolio.domain.model.pricing.PricingStatus;
import dev.portfolio.domain.model.pricing.PricingUnit;
import dev.portfolio.domain.model.pricing.SkuPricing;
import dev.portfolio.infrastructure.adapter.in.mcp.McpObserver;
import dev.portfolio.infrastructure.adapter.in.mcp.McpSdkServer;
import dev.portfolio.infrastructure.adapter.in.mcp.PortfolioCatalog;
import dev.portfolio.infrastructure.adapter.in.mcp.PortfolioTools;
import dev.portfolio.infrastructure.bootstrap.ArchitecturePresetSeeder;
import io.modelcontextprotocol.client.McpClient;
import io.modelcontextprotocol.client.McpSyncClient;
import io.modelcontextprotocol.client.transport.HttpClientStreamableHttpTransport;
import io.modelcontextprotocol.spec.McpSchema;
import org.apache.catalina.Context;
import org.apache.catalina.Wrapper;
import org.apache.catalina.startup.Tomcat;

import java.io.File;
import java.nio.file.Files;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Set;

/**
 * El servidor MCP de la plataforma en un Tomcat embebido, para las pruebas que lo usan con un
 * cliente real. Detrás están los casos de uso de verdad con las plantillas que siembra la
 * plataforma. Lo único simulado es lo que sale a Internet, y es determinista:
 * <ul>
 *   <li>los precios: una tarifa fija para {@code vm} y {@code postgres}; lo demás, sin precio;</li>
 *   <li>la IA del portafolio: siempre la misma respuesta, con una cita.</li>
 * </ul>
 */
public final class McpTestServer implements AutoCloseable {

    private static final Set<String> PRICED = Set.of("vm", "postgres");

    private final Tomcat tomcat = new Tomcat();
    private final McpSdkServer server;
    private final String baseUrl;

    public McpTestServer(McpObserver observer) throws Exception {
        RateLimiterPort unlimited = (key, policy) -> RateLimitDecision.unrestricted(policy);
        RateLimitPolicy policy = new RateLimitPolicy(100_000, Duration.ofMinutes(1));
        InMemoryRepository repository = new InMemoryRepository();
        ArchitectureProjectService projects = new ArchitectureProjectService(repository, GraphRulesFixture.load(), flag -> true, SystemDesignFixture.rules());
        new ArchitecturePresetSeeder(projects, new ObjectMapper()).seed();
        SystemDesignService systemDesign = new SystemDesignService(SystemDesignFixture.rules(), unlimited, policy, repository);

        PricingUseCase pricing = (provider, services, client) -> services.stream().map(service -> PRICED.contains(service)
                ? PriceQuote.priced(service, provider, PricingStatus.LIVE, new SkuPricing("SKU-" + service, "Tarifa de prueba · " + service,
                        Money.usd("0.1000"), PricingUnit.HOURLY, "region-de-prueba", "Fuente simulada", Instant.parse("2026-10-12T00:00:00Z")), "Una unidad.")
                : PriceQuote.unknown(service, provider, "Sin precio público.")).toList();
        RAGUseCase rag = (query, client) -> new RAGAnswerDomain(
                "El backend sigue una arquitectura hexagonal: dominio y aplicación sin Spring, y adaptadores alrededor.",
                List.of(new RAGAnswerDomain.Citation("docs/architecture/ARCHITECTURE.md", "1-40", "")));
        CloudCatalogUseCase cloudCatalog = new CloudCatalogUseCase() {
            @Override
            public List<dev.portfolio.domain.model.CloudCatalogItemDomain> find(java.util.Optional<CloudProviderDomain> provider) {
                return List.of(new dev.portfolio.domain.model.CloudCatalogItemDomain("aws:queue", CloudProviderDomain.AWS, "queue", "SQS", "messaging", null, false));
            }

            @Override
            public int registerDefaults(List<dev.portfolio.domain.model.CloudCatalogItemDomain> items) {
                return 0;
            }
        };
        ProjectUseCase portfolio = org.mockito.Mockito.mock(ProjectUseCase.class);

        server = new McpSdkServer(
                PortfolioTools.all(projects, new TerraformService(unlimited, policy), pricing, rag, systemDesign),
                PortfolioCatalog.resources(cloudCatalog, systemDesign, portfolio), PortfolioCatalog.prompts(),
                new McpAccessService(unlimited, policy, policy), observer);

        tomcat.setBaseDir(Files.createTempDirectory("mcp-test-server").toString());
        tomcat.setPort(0);
        Context context = tomcat.addContext("/v1", new File(System.getProperty("java.io.tmpdir")).getAbsolutePath());
        Wrapper wrapper = Tomcat.addServlet(context, "mcp", server.servlet());
        wrapper.setAsyncSupported(true);
        context.addServletMappingDecoded(McpSdkServer.ENDPOINT, "mcp");
        tomcat.getConnector();
        tomcat.start();
        baseUrl = "http://localhost:" + tomcat.getConnector().getLocalPort();
    }

    /** Dirección completa del punto de conexión MCP. */
    public String url() {
        return baseUrl + "/v1" + McpSdkServer.ENDPOINT;
    }

    /** Un cliente MCP ya inicializado, sin elicitation. */
    public McpSyncClient client() {
        McpSyncClient client = McpClient.sync(HttpClientStreamableHttpTransport.builder(baseUrl).endpoint("/v1" + McpSdkServer.ENDPOINT).build())
                .requestTimeout(Duration.ofSeconds(30))
                .clientInfo(new McpSchema.Implementation("eval-client", "1.0.0"))
                .build();
        client.initialize();
        return client;
    }

    @Override
    public void close() throws Exception {
        server.close();
        tomcat.stop();
        tomcat.destroy();
    }
}
