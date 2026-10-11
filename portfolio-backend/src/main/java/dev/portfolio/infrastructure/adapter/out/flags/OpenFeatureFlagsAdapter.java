package dev.portfolio.infrastructure.adapter.out.flags;

import dev.openfeature.sdk.Client;
import dev.portfolio.application.port.out.FeatureFlags;
import dev.portfolio.domain.model.FeatureFlagDomain;

/**
 * Evalúa las flags con el cliente de OpenFeature. El valor por defecto es siempre «apagada»:
 * es lo que devuelve el SDK cuando el proveedor falla o no conoce la flag.
 */
public class OpenFeatureFlagsAdapter implements FeatureFlags {

    private final Client client;

    public OpenFeatureFlagsAdapter(Client client) {
        this.client = client;
    }

    @Override
    public boolean isEnabled(FeatureFlagDomain flag) {
        return client.getBooleanValue(flag.key(), false);
    }
}
