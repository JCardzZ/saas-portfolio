package dev.portfolio.application.service;

import dev.portfolio.domain.model.CloudProviderDomain;

import java.time.Duration;

final class CacheKeys {

    static final String TECHNOLOGIES_ALL = "portfolio:technologies:all";
    static final String PROJECTS_ALL = "portfolio:projects:all";
    static final String ARTICLES_ALL = "portfolio:articles:all";
    static final String CLOUD_CATALOG_ALL = "portfolio:cloud-catalog:all";
    static final Duration TTL = Duration.ofMinutes(10);
    static final String FEATURE_FLAGS_ENABLED = "portfolio:feature-flags:enabled";
    /** Corta: si el borrado tras un cambio no llega a Redis, la flag se corrige sola en un minuto. */
    static final Duration FEATURE_FLAGS_TTL = Duration.ofMinutes(1);

    /** Tarifa vigente de un servicio en una nube. */
    static String pricing(CloudProviderDomain provider, String serviceCode) {
        return "portfolio:pricing:" + provider.code() + ":" + serviceCode;
    }

    /** Última tarifa conocida: sobrevive a la vigente, para cuando el proveedor no responde. */
    static String pricingLastKnown(CloudProviderDomain provider, String serviceCode) {
        return pricing(provider, serviceCode) + ":last";
    }

    private CacheKeys() {
    }
}
