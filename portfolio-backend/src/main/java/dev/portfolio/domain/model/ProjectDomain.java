package dev.portfolio.domain.model;

import java.util.List;

public record ProjectDomain(
        String id,
        String title,
        String summary,
        String githubRepoUrl,
        String demoVideoUrl,
        String coverImageUrl,
        String metricsImpact,
        List<String> technologyIds
) {

    public ProjectDomain {
        technologyIds = technologyIds == null ? List.of() : List.copyOf(technologyIds);
    }

    public ProjectDomain withId(String newId) {
        return new ProjectDomain(newId, title, summary, githubRepoUrl, demoVideoUrl, coverImageUrl, metricsImpact, technologyIds);
    }
}
