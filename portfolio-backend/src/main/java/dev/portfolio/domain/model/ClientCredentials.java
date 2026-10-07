package dev.portfolio.domain.model;

public record ClientCredentials(String clientId, String clientSecret, String grantType) {

    public static final String CLIENT_CREDENTIALS_GRANT = "client_credentials";

    public boolean usesSupportedGrant() {
        return CLIENT_CREDENTIALS_GRANT.equals(grantType);
    }

    // El secreto nunca debe acabar en un log por un toString accidental.
    @Override
    public String toString() {
        return "ClientCredentials[clientId=%s, clientSecret=***, grantType=%s]".formatted(clientId, grantType);
    }
}
