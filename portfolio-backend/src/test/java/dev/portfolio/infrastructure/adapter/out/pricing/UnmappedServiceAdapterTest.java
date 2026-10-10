package dev.portfolio.infrastructure.adapter.out.pricing;

import dev.portfolio.domain.model.CloudProviderDomain;
import dev.portfolio.domain.model.pricing.PriceQuote;
import dev.portfolio.domain.model.pricing.PricingStatus;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class UnmappedServiceAdapterTest {

    private final List<String> telemetry = new ArrayList<>();
    private final UnmappedServiceAdapter adapter = new UnmappedServiceAdapter((type, details, traceId) -> telemetry.add(type + " " + details));

    @Test
    void marksLicensedProductsAsUnestimatedAndSaysSo() {
        for (String code : List.of("snowflake", "databricks", "tableau", "powerbi", "looker-studio", "goldengate")) {
            PriceQuote quote = adapter.quote(CloudProviderDomain.AWS, code);

            assertThat(quote.status()).as(code).isEqualTo(PricingStatus.UNESTIMATED_ENTERPRISE_LICENSE);
            assertThat(quote.price()).as(code).isEmpty();
            assertThat(quote.note()).as(code).contains("oferta comercial");
        }
        assertThat(telemetry).hasSize(6).first()
                .isEqualTo("PRICING_UNESTIMATED Service 'Snowflake' requires enterprise quote -> Pricing marked as Unestimated.");
    }

    @Test
    void anythingElseIsAnUnknownPriceWithItsReason() {
        assertThat(adapter.supports(CloudProviderDomain.GCP, "lo-que-sea")).isTrue();

        PriceQuote aws = adapter.quote(CloudProviderDomain.AWS, "vm");
        PriceQuote azure = adapter.quote(CloudProviderDomain.AZURE, "functions");

        assertThat(aws.status()).isEqualTo(PricingStatus.UNKNOWN_PRICING);
        assertThat(aws.note()).isEqualTo("Este servicio no tiene todavía una tarifa de AWS asignada.");
        assertThat(azure.note()).isEqualTo("Este servicio no tiene todavía una tarifa de Azure asignada.");
        assertThat(telemetry).isEmpty();
    }
}
