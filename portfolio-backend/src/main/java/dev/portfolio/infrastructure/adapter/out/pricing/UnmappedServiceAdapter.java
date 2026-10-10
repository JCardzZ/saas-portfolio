package dev.portfolio.infrastructure.adapter.out.pricing;

import dev.portfolio.application.port.out.PricingProviderPort;
import dev.portfolio.application.port.out.TelemetryPort;
import dev.portfolio.domain.model.CloudProviderDomain;
import dev.portfolio.domain.model.TelemetryEventType;
import dev.portfolio.domain.model.pricing.PriceQuote;
import lombok.extern.slf4j.Slf4j;

import java.util.Map;

/**
 * Lo que ninguna otra fuente cotiza. No llama a nadie: responde con un estado explícito y lo
 * deja escrito, para que la falta de precio se vea en vez de pasar por un cero.
 * <ul>
 *   <li>Productos con licencia o contrato (Snowflake, Databricks, Tableau…): su precio depende
 *       de una oferta comercial y no está en ninguna API pública → {@code UNESTIMATED_ENTERPRISE_LICENSE}.</li>
 *   <li>Todo lo demás (un servicio sin SKU asignado, una nube sin adaptador todavía) → {@code UNKNOWN_PRICING}.</li>
 * </ul>
 */
@Slf4j
public class UnmappedServiceAdapter implements PricingProviderPort {

    /** Productos de terceros que se contratan con oferta comercial, por su código en el catálogo. */
    private static final Map<String, String> ENTERPRISE_LICENSED = Map.of(
            "snowflake", "Snowflake",
            "databricks", "Databricks",
            "tableau", "Tableau",
            "powerbi", "Power BI",
            "looker-studio", "Looker Studio",
            "goldengate", "Oracle GoldenGate",
            "datadog", "Datadog",
            "mongodb", "MongoDB Atlas");

    private final TelemetryPort telemetry;

    public UnmappedServiceAdapter(TelemetryPort telemetry) {
        this.telemetry = telemetry;
    }

    @Override
    public boolean supports(CloudProviderDomain provider, String serviceCode) {
        return true;
    }

    @Override
    public PriceQuote quote(CloudProviderDomain provider, String serviceCode) {
        String product = ENTERPRISE_LICENSED.get(serviceCode);
        if (product != null) {
            log.info("FinOps: '{}' requiere oferta comercial; queda sin estimación", product);
            telemetry.publish(TelemetryEventType.PRICING_UNESTIMATED,
                    "Service '%s' requires enterprise quote -> Pricing marked as Unestimated.".formatted(product));
            return PriceQuote.enterpriseLicense(serviceCode, provider,
                    product + " se contrata con oferta comercial: no tiene precio en una API pública.");
        }
        log.info("FinOps: sin tarifa pública asignada para '{}' en {}", serviceCode, provider.displayName());
        return PriceQuote.unknown(serviceCode, provider, provider == CloudProviderDomain.AZURE
                ? "Este servicio no tiene todavía un SKU de Azure asignado."
                : "Todavía no hay un adaptador de precios para " + provider.displayName() + ".");
    }
}
