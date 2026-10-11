package dev.portfolio.application.service;

import dev.portfolio.application.port.in.FeatureFlagUseCase;
import dev.portfolio.application.port.out.CachePort;
import dev.portfolio.application.port.out.FeatureFlagRepositoryPort;
import dev.portfolio.domain.exception.ResourceNotFoundException;
import dev.portfolio.domain.model.FeatureFlagChangeDomain;
import dev.portfolio.domain.model.FeatureFlagDomain;
import dev.portfolio.domain.model.FeatureFlagStateDomain;

import java.time.Clock;
import java.util.Arrays;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

public class FeatureFlagService implements FeatureFlagUseCase {

    static final int AUDIT_LIMIT = 100;

    private final FeatureFlagRepositoryPort repository;
    private final CachePort cache;
    private final Clock clock;

    public FeatureFlagService(FeatureFlagRepositoryPort repository, CachePort cache, Clock clock) {
        this.repository = repository;
        this.cache = cache;
        this.clock = clock;
    }

    @Override
    public Set<FeatureFlagDomain> enabled() {
        // En la caché van las claves, no el enum: una flag retirada del código se ignora al leer.
        List<String> keys = cache.getList(CacheKeys.FEATURE_FLAGS_ENABLED, String.class).orElseGet(() -> {
            List<String> stored = repository.findAll().stream()
                    .filter(FeatureFlagStateDomain::enabled)
                    .map(state -> state.flag().key())
                    .toList();
            cache.put(CacheKeys.FEATURE_FLAGS_ENABLED, stored, CacheKeys.FEATURE_FLAGS_TTL);
            return stored;
        });
        Set<FeatureFlagDomain> enabled = EnumSet.noneOf(FeatureFlagDomain.class);
        keys.forEach(key -> FeatureFlagDomain.fromKey(key).ifPresent(enabled::add));
        return enabled;
    }

    @Override
    public List<FeatureFlagStateDomain> findAll() {
        Map<FeatureFlagDomain, FeatureFlagStateDomain> stored = repository.findAll().stream()
                .collect(Collectors.toMap(FeatureFlagStateDomain::flag, Function.identity()));
        return Arrays.stream(FeatureFlagDomain.values())
                .map(flag -> stored.getOrDefault(flag, FeatureFlagStateDomain.untouched(flag)))
                .toList();
    }

    @Override
    public FeatureFlagStateDomain set(String key, boolean enabled, String actor) {
        FeatureFlagDomain flag = FeatureFlagDomain.fromKey(key)
                .orElseThrow(() -> new ResourceNotFoundException("Feature flag", key));
        FeatureFlagStateDomain current = repository.findAll().stream()
                .filter(state -> state.flag() == flag)
                .findFirst()
                .orElse(FeatureFlagStateDomain.untouched(flag));
        if (current.enabled() == enabled) {
            return current;
        }
        FeatureFlagStateDomain saved = repository.save(
                new FeatureFlagChangeDomain(flag, enabled, current.enabled(), actor, clock.instant()));
        cache.evict(CacheKeys.FEATURE_FLAGS_ENABLED);
        return saved;
    }

    @Override
    public List<FeatureFlagChangeDomain> audit() {
        return repository.findRecentChanges(AUDIT_LIMIT);
    }
}
