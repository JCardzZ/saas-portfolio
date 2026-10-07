package dev.portfolio.application.port.in;

import dev.portfolio.domain.model.CloudProviderDomain;
import dev.portfolio.domain.model.TerraformBundleDomain;

import java.util.List;
import java.util.Map;

public interface TerraformUseCase {

    /**
     * @param clientKey identifica al origen de la petición, para limitar cuántas hace
     * @return el esqueleto de Terraform de la topología
     * @throws dev.portfolio.domain.exception.InvalidRequestException    si la topología no es válida
     * @throws dev.portfolio.domain.exception.RateLimitExceededException si el origen ha hecho demasiadas peticiones
     */
    TerraformBundleDomain generate(CloudProviderDomain provider, List<Map<String, Object>> nodes,
                                   List<Map<String, Object>> connections, String clientKey);
}
