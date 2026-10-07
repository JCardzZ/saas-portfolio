package dev.portfolio.application.service;

import java.time.Duration;

final class CacheKeys {

    static final String TECHNOLOGIES_ALL = "portfolio:technologies:all";
    static final String PROJECTS_ALL = "portfolio:projects:all";
    static final String ARTICLES_ALL = "portfolio:articles:all";
    static final String CLOUD_CATALOG_ALL = "portfolio:cloud-catalog:all";
    static final Duration TTL = Duration.ofMinutes(10);

    private CacheKeys() {
    }
}
