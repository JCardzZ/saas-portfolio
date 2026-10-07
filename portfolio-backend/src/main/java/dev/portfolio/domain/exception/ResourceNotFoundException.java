package dev.portfolio.domain.exception;

public class ResourceNotFoundException extends RuntimeException {

    private final String resource;
    private final String resourceId;

    public ResourceNotFoundException(String resource, String resourceId) {
        super("%s con id '%s' no encontrado".formatted(resource, resourceId));
        this.resource = resource;
        this.resourceId = resourceId;
    }

    public String getResource() {
        return resource;
    }

    public String getResourceId() {
        return resourceId;
    }
}
