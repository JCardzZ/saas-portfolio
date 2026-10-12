package dev.portfolio.infrastructure.adapter.in.web.flags;

import dev.portfolio.application.port.in.FeatureFlagUseCase;
import dev.portfolio.domain.exception.InvalidRequestException;
import dev.portfolio.domain.model.CloudProviderDomain;
import dev.portfolio.domain.model.FeatureFlagDomain;
import org.springframework.beans.factory.ObjectProvider;

/**
 * La nube que nombra una petición. Oracle Cloud solo existe para quien llama mientras la flag
 * {@code cloud.oracle} esté encendida: apagada, se responde lo mismo que a una nube desconocida.
 * Sin proveedor de flags (un contexto parcial) cuenta como apagada.
 */
public final class CloudProviders {

    private CloudProviders() {
    }

    /** @throws InvalidRequestException si la nube no existe o está detrás de una flag apagada */
    public static CloudProviderDomain resolve(String code, ObjectProvider<FeatureFlagUseCase> flags) {
        CloudProviderDomain provider = CloudProviderDomain.fromCode(code);
        if (provider == CloudProviderDomain.OCI) {
            FeatureFlagUseCase useCase = flags.getIfAvailable();
            if (useCase == null || !useCase.enabled().contains(FeatureFlagDomain.CLOUD_ORACLE)) {
                throw new InvalidRequestException("Nube no admitida: '" + code + "'. Valores: aws, gcp, azure");
            }
        }
        return provider;
    }
}
