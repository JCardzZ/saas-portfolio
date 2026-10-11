package dev.portfolio.application.service;

import dev.portfolio.domain.model.CloudProviderDomain;

import java.time.Duration;

final class CacheKeys {

    static final String TECHNOLOGIES_ALL = "portfolio:technologies:all";
    static final String PROJECTS_ALL = "portfolio:projects:all";
    static final String ARTICLES_ALL = "portfolio:articles:all";
    static final String CLOUD_CATALOG_ALL = "portfolio:cloud-catalog:all";
    static final Duration TTL = Duration.ofMinutes(10);

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
