package dev.portfolio.domain.model;

import java.util.List;

public record ClientIdentity(String subject, List<String> roles) {

    public ClientIdentity {
        roles = roles == null ? List.of() : List.copyOf(roles);
    }
}
