package dev.portfolio.infrastructure.adapter.out.pricing;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.core.JsonToken;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.portfolio.application.port.out.PricingProviderPort;
import dev.portfolio.application.port.out.TelemetryPort;
import dev.portfolio.domain.exception.PricingUnavailableException;
import dev.portfolio.domain.model.CloudProviderDomain;
import dev.portfolio.domain.model.TelemetryEventType;
import dev.portfolio.domain.model.pricing.Currency;
import dev.portfolio.domain.model.pricing.Money;
import dev.portfolio.domain.model.pricing.PriceQuote;
import dev.portfolio.domain.model.pricing.PricingStatus;
import dev.portfolio.domain.model.pricing.SkuPricing;
import dev.portfolio.infrastructure.adapter.out.pricing.AwsSkuCatalog.AwsSku;
import io.github.resilience4j.circuitbreaker.CallNotPermittedException;
import io.github.resilience4j.circuitbreaker.CircuitBreaker;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.math.BigDecimal;
import java.time.Clock;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Precios de lista de AWS, leídos de sus ficheros públicos de precios por servicio y región (sin
 * clave). No hay consulta por producto: se descarga el fichero del servicio y se recorre en
 * streaming, sin cargarlo entero, hasta dar con el producto de {@link AwsSkuCatalog} y su tarifa
 * bajo demanda. Solo se acepta si hay exactamente un producto y un precio, en la unidad esperada.
 * Un fichero mayor que el tope configurado no se lee. Las descargas pasan por un circuit breaker.
 */
@Slf4j
public class AwsPriceListAdapter implements PricingProviderPort {

    static final String SOURCE = "AWS Price List (Bulk API)";
    private static final String USD = "USD";
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final RestClient restClient;
    private final long maxBytes;
    private final CircuitBreaker circuitBreaker;
    private final TelemetryPort telemetry;
    private final Clock clock;

    public AwsPriceListAdapter(RestClient restClient, long maxBytes, CircuitBreaker circuitBreaker, TelemetryPort telemetry, Clock clock) {
        this.restClient = restClient;
        this.maxBytes = maxBytes;
        this.circuitBreaker = circuitBreaker;
        this.telemetry = telemetry;
        this.clock = clock;
    }

    /** Lo que se saca del fichero: los productos que encajan con la fila de la tabla y sus tarifas bajo demanda. */
    record Matches(Set<String> products, List<JsonNode> onDemandTerms) {
    }

    @Override
    public boolean supports(CloudProviderDomain provider, String serviceCode) {
        return provider == CloudProviderDomain.AWS && AwsSkuCatalog.find(serviceCode).isPresent();
    }

    @Override
    public PriceQuote quote(CloudProviderDomain provider, String serviceCode) {
        AwsSku sku = AwsSkuCatalog.find(serviceCode).filter(found -> provider == CloudProviderDomain.AWS)
                .orElseThrow(() -> new IllegalArgumentException("Servicio sin tarifa de AWS: " + serviceCode));
        telemetry.publish(TelemetryEventType.PRICING_REQUEST, "Dispatching GET to AWS Price List for SKU '%s'...".formatted(sku.sku()));

        Matches matches;
        try {
            matches = circuitBreaker.executeSupplier(() -> fetch(sku));
        } catch (CallNotPermittedException e) {
            throw new PricingUnavailableException("El circuito de la lista de precios de AWS está abierto", e);
        } catch (RestClientException e) {
            log.warn("AWS Price List no disponible para {}: {}", sku.sku(), e.getMessage());
            throw new PricingUnavailableException("La lista de precios de AWS no responde", e);
        }

        JsonNode dimension = onlyPriceDimension(matches, sku);
        try {
            SkuPricing pricing = new SkuPricing(sku.sku(), dimension.path("description").asText(sku.sku()),
                    new Money(new BigDecimal(dimension.path("pricePerUnit").path(USD).asText()), Currency.of(USD)),
                    sku.pricingUnit(), AwsSkuCatalog.REGION, SOURCE, clock.instant());
            return PriceQuote.priced(serviceCode, provider, PricingStatus.LIVE, pricing, sku.note());
        } catch (IllegalArgumentException e) {
            throw new PricingUnavailableException("La lista de precios de AWS trae un precio no válido para " + sku.sku(), e);
        }
    }

    private Matches fetch(AwsSku sku) {
        // El servicio y la región salen de la tabla de tarifas, nunca de la petición del cliente.
        return restClient.get()
                .uri("/offers/v1.0/aws/{offer}/current/{region}/index.json", sku.offerCode(), AwsSkuCatalog.REGION)
                .exchange((request, response) -> {
                    if (!response.getStatusCode().is2xxSuccessful()) {
                        throw new PricingUnavailableException("La lista de precios de AWS respondió " + response.getStatusCode().value());
                    }
                    if (response.getHeaders().getContentLength() > maxBytes) {
                        throw new PricingUnavailableException("El fichero de precios de " + sku.offerCode() + " supera el tope de lectura");
                    }
                    try (InputStream body = new BoundedInputStream(response.getBody(), maxBytes)) {
                        return scan(body, sku);
                    }
                });
    }

    /** Recorre el fichero sin guardarlo: de {@code products} se queda con los que encajan y de {@code terms.OnDemand}, con sus tarifas. */
    static Matches scan(InputStream body, AwsSku sku) throws IOException {
        Set<String> products = new HashSet<>();
        List<JsonNode> terms = new ArrayList<>();
        try (JsonParser parser = MAPPER.createParser(body)) {
            if (parser.nextToken() != JsonToken.START_OBJECT) {
                throw new PricingUnavailableException("El fichero de precios de AWS no tiene el formato esperado");
            }
            while (parser.nextToken() == JsonToken.FIELD_NAME) {
                String section = parser.currentName();
                parser.nextToken();
                if ("products".equals(section)) {
                    while (parser.nextToken() == JsonToken.FIELD_NAME) {
                        String id = parser.currentName();
                        parser.nextToken();
                        if (isTheProduct(MAPPER.readTree(parser), sku)) {
                            products.add(id);
                        }
                    }
                } else if ("terms".equals(section)) {
                    while (parser.nextToken() == JsonToken.FIELD_NAME) {
                        boolean onDemand = "OnDemand".equals(parser.currentName());
                        parser.nextToken();
                        if (!onDemand) {
                            parser.skipChildren();
                            continue;
                        }
                        while (parser.nextToken() == JsonToken.FIELD_NAME) {
                            String id = parser.currentName();
                            parser.nextToken();
                            if (products.contains(id)) {
                                terms.add(MAPPER.readTree(parser));
                            } else {
                                parser.skipChildren();
                            }
                        }
                    }
                } else {
                    parser.skipChildren();
                }
            }
        }
        return new Matches(products, terms);
    }

    private static boolean isTheProduct(JsonNode product, AwsSku sku) {
        JsonNode attributes = product.path("attributes");
        if (!sku.usageType().equals(attributes.path("usagetype").asText())
                || !AwsSkuCatalog.REGION.equals(attributes.path("regionCode").asText())) {
            return false;
        }
        for (Map.Entry<String, String> expected : sku.attributes().entrySet()) {
            if (!expected.getValue().equals(attributes.path(expected.getKey()).asText())) {
                return false;
            }
        }
        return true;
    }

    /** El precio que se pidió y ningún otro: un producto, una oferta bajo demanda, un tramo desde cero, en dólares y en la unidad esperada. */
    private static JsonNode onlyPriceDimension(Matches matches, AwsSku sku) {
        if (matches.products().size() == 1 && matches.onDemandTerms().size() == 1 && matches.onDemandTerms().get(0).size() == 1) {
            JsonNode dimensions = matches.onDemandTerms().get(0).elements().next().path("priceDimensions");
            if (dimensions.size() == 1) {
                JsonNode dimension = dimensions.elements().next();
                if (sku.unit().equals(dimension.path("unit").asText())
                        && "0".equals(dimension.path("beginRange").asText())
                        && isPositive(dimension.path("pricePerUnit").path(USD).asText())) {
                    return dimension;
                }
            }
        }
        log.warn("AWS Price List no trae la tarifa esperada para {} ({} / {}): {} productos, {} tarifas",
                sku.sku(), sku.offerCode(), sku.usageType(), matches.products().size(), matches.onDemandTerms().size());
        throw new PricingUnavailableException("La lista de precios de AWS no trae la tarifa de " + sku.sku());
    }

    private static boolean isPositive(String amount) {
        try {
            return new BigDecimal(amount).signum() > 0;
        } catch (NumberFormatException e) {
            return false;
        }
    }

    /** Corta la lectura al pasar del tope, por si la respuesta no declara su tamaño. */
    private static final class BoundedInputStream extends FilterInputStream {
        private long remaining;

        BoundedInputStream(InputStream in, long limit) {
            super(in);
            this.remaining = limit;
        }

        @Override
        public int read() throws IOException {
            int value = super.read();
            if (value >= 0) {
                consumed(1);
            }
            return value;
        }

        @Override
        public int read(byte[] buffer, int offset, int length) throws IOException {
            int count = super.read(buffer, offset, length);
            if (count > 0) {
                consumed(count);
            }
            return count;
        }

        private void consumed(int count) throws IOException {
            remaining -= count;
            if (remaining < 0) {
                throw new IOException("El fichero de precios supera el tope de lectura");
            }
        }
    }
}
