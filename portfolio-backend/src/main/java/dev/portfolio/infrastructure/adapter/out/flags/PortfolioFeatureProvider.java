package dev.portfolio.infrastructure.adapter.out.flags;

import dev.openfeature.sdk.ErrorCode;
import dev.openfeature.sdk.EvaluationContext;
import dev.openfeature.sdk.FeatureProvider;
import dev.openfeature.sdk.Metadata;
import dev.openfeature.sdk.ProviderEvaluation;
import dev.openfeature.sdk.Reason;
import dev.openfeature.sdk.Value;
import dev.portfolio.application.port.in.FeatureFlagUseCase;
import dev.portfolio.domain.model.FeatureFlagDomain;

import java.util.Optional;

/**
 * Proveedor de OpenFeature respaldado por la plataforma: las flags viven en PostgreSQL y se leen
 * a través de la caché (Redis best-effort). Todas son booleanas. Si la lectura falla, la
 * excepción sale de aquí y el SDK devuelve el valor por defecto de quien pregunta.
 */
public class PortfolioFeatureProvider implements FeatureProvider {

    static final String NAME = "portfolio-database";

    private final FeatureFlagUseCase flags;

    public PortfolioFeatureProvider(FeatureFlagUseCase flags) {
        this.flags = flags;
    }

    @Override
    public Metadata getMetadata() {
        return () -> NAME;
    }

    @Override
    public ProviderEvaluation<Boolean> getBooleanEvaluation(String key, Boolean defaultValue, EvaluationContext ctx) {
        Optional<FeatureFlagDomain> flag = FeatureFlagDomain.fromKey(key);
        if (flag.isEmpty()) {
            return ProviderEvaluation.<Boolean>builder()
                    .value(defaultValue)
                    .reason(Reason.ERROR.toString())
                    .errorCode(ErrorCode.FLAG_NOT_FOUND)
                    .errorMessage("Unknown flag: " + key)
                    .build();
        }
        return ProviderEvaluation.<Boolean>builder()
                .value(flags.enabled().contains(flag.get()))
                .reason(Reason.STATIC.toString())
                .build();
    }

    @Override
    public ProviderEvaluation<String> getStringEvaluation(String key, String defaultValue, EvaluationContext ctx) {
        return notBoolean(defaultValue);
    }

    @Override
    public ProviderEvaluation<Integer> getIntegerEvaluation(String key, Integer defaultValue, EvaluationContext ctx) {
        return notBoolean(defaultValue);
    }

    @Override
    public ProviderEvaluation<Double> getDoubleEvaluation(String key, Double defaultValue, EvaluationContext ctx) {
        return notBoolean(defaultValue);
    }

    @Override
    public ProviderEvaluation<Value> getObjectEvaluation(String key, Value defaultValue, EvaluationContext ctx) {
        return notBoolean(defaultValue);
    }

    private static <T> ProviderEvaluation<T> notBoolean(T defaultValue) {
        return ProviderEvaluation.<T>builder()
                .value(defaultValue)
                .reason(Reason.ERROR.toString())
                .errorCode(ErrorCode.TYPE_MISMATCH)
                .errorMessage("Every flag of this platform is boolean")
                .build();
    }
}
