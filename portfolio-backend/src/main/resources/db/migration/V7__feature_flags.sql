-- Feature flags: lo nuevo se publica apagado y se enciende aquí, sin desplegar.
-- Solo hay fila para una flag que alguien ha cambiado; sin fila, está apagada.
-- Las flags que existen las declara el código (FeatureFlagDomain), no esta tabla.
CREATE TABLE feature_flags (
    id         VARCHAR(101) PRIMARY KEY, -- <tenant>:<clave>
    tenant_id  VARCHAR(36) NOT NULL DEFAULT 'default-tenant',
    flag_key   VARCHAR(64) NOT NULL,
    enabled    BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by VARCHAR(80) NOT NULL,
    CONSTRAINT uq_feature_flags_tenant_key UNIQUE (tenant_id, flag_key)
);

-- Quién cambió qué y cuándo. Solo se añaden filas: nunca se actualizan ni se borran.
CREATE TABLE feature_flag_audit (
    id         BIGSERIAL PRIMARY KEY,
    tenant_id  VARCHAR(36) NOT NULL DEFAULT 'default-tenant',
    flag_key   VARCHAR(64) NOT NULL,
    enabled    BOOLEAN NOT NULL,
    previous   BOOLEAN NOT NULL,
    actor      VARCHAR(80) NOT NULL,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_feature_flag_audit_tenant_changed ON feature_flag_audit (tenant_id, changed_at DESC);
