package dev.portfolio.domain.model.pricing;

import dev.portfolio.domain.model.CloudProviderDomain;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PricingValueObjectsTest {

    private static final Instant NOW = Instant.parse("2026-10-10T12:00:00Z");

    private static SkuPricing hourly(String amount) {
        return new SkuPricing("D2s_v5", "Virtual Machines Dsv5 Series · D2s v5", Money.usd(amount), PricingUnit.HOURLY, "eastus", "Azure Retail Prices API", NOW);
    }

    @Test
    void aCurrencyIsAnIsoCode() {
        assertThat(Currency.of(" usd ")).isEqualTo(Currency.USD);
        assertThat(Currency.USD).hasToString("USD");
        assertThatThrownBy(() -> new Currency("usd")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new Currency("DOLAR")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> Currency.of(null)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void moneyIsNeverNegativeAndNeverMixesCurrencies() {
        assertThatThrownBy(() -> Money.usd("-0.01")).isInstanceOf(IllegalArgumentException.class).hasMessageContaining("negativo");
        assertThatThrownBy(() -> new Money(null, Currency.USD)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new Money(BigDecimal.ONE, null)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> Money.usd("1").plus(Money.of("1", new Currency("EUR"))))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("USD y EUR");
        assertThatThrownBy(() -> Money.usd("1").times(BigDecimal.valueOf(-1))).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void moneyKeepsItsPrecisionAndComparesByValue() {
        assertThat(Money.usd("0.0960")).isEqualTo(Money.usd("0.096")).hasSameHashCodeAs(Money.usd("0.096"));
        assertThat(Money.usd("100")).isEqualTo(Money.usd("1E+2"));
        assertThat(Money.usd("0.00")).isEqualTo(Money.usd("0"));
        assertThat(Money.usd("0.096").times(BigDecimal.valueOf(730))).isEqualTo(Money.usd("70.08"));
        assertThat(Money.usd("0.1").plus(Money.usd("0.2"))).isEqualTo(Money.usd("0.3"));
        assertThat(Money.usd("0.096").formatted(4)).isEqualTo("0.0960");
        assertThat(Money.usd("0.039687").formatted(4)).isEqualTo("0.0397");
    }

    @Test
    void onlyAUnitOfTimeBecomesAMonth() {
        assertThat(PricingUnit.HOURLY.monthlyFactor()).contains(BigDecimal.valueOf(730));
        assertThat(PricingUnit.MONTHLY.monthlyFactor()).contains(BigDecimal.ONE);
        assertThat(PricingUnit.PER_GB.monthlyFactor()).isEmpty();

        assertThat(hourly("0.096").monthlyCost()).contains(Money.usd("70.08"));
        SkuPricing perGb = new SkuPricing("Blob Hot", "", Money.usd("0.018"), PricingUnit.PER_GB, "eastus", "", NOW);
        assertThat(perGb.monthlyCost()).isEmpty();
    }

    @Test
    void aSkuPriceIsWrittenAsInTheTrace() {
        assertThat(hourly("0.096").display()).isEqualTo("$0.0960 USD/hr");
        assertThatThrownBy(() -> new SkuPricing(" ", "", Money.usd("1"), PricingUnit.HOURLY, "", "", NOW)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new SkuPricing("x", "", null, PricingUnit.HOURLY, "", "", NOW)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new SkuPricing("x", "", Money.usd("1"), PricingUnit.HOURLY, "", "", null)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void aQuoteCarriesAPriceIfAndOnlyIfItsStatusSaysSo() {
        PriceQuote live = PriceQuote.priced("vm", CloudProviderDomain.AZURE, PricingStatus.LIVE, hourly("0.096"), "Solo cómputo");
        assertThat(live.price()).isPresent();
        assertThat(live.as(PricingStatus.CACHED).status()).isEqualTo(PricingStatus.CACHED);
        assertThat(live.as(PricingStatus.STALE).pricing()).isEqualTo(live.pricing());

        assertThat(PriceQuote.unknown("vm", CloudProviderDomain.AWS, null).price()).isEmpty();
        assertThat(PriceQuote.unknown("vm", CloudProviderDomain.AWS, null).note()).isEmpty();
        assertThat(PriceQuote.enterpriseLicense("snowflake", CloudProviderDomain.GCP, "oferta").status())
                .isEqualTo(PricingStatus.UNESTIMATED_ENTERPRISE_LICENSE);

        assertThatThrownBy(() -> new PriceQuote("vm", CloudProviderDomain.AZURE, PricingStatus.LIVE, null, ""))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new PriceQuote("vm", CloudProviderDomain.AZURE, PricingStatus.UNKNOWN_PRICING, hourly("1"), ""))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> live.as(PricingStatus.UNKNOWN_PRICING)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> PriceQuote.unknown(" ", CloudProviderDomain.AZURE, "")).isInstanceOf(IllegalArgumentException.class);
    }
}
