package dev.portfolio.domain.model;

public record TechnologyDomain(
        String id,
        String name,
        String category,
        String proficiencyLevel,
        String iconUrl,
        boolean featured
) {

    public TechnologyDomain withId(String newId) {
        return new TechnologyDomain(newId, name, category, proficiencyLevel, iconUrl, featured);
    }
}
