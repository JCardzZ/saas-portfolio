-- Usuarios de la administración y sus sesiones. Hasta aquí solo existía un cliente de máquina
-- configurado por variables de entorno; sigue existiendo, junto a las personas.
CREATE TABLE users (
    id            VARCHAR(36) PRIMARY KEY,
    tenant_id     VARCHAR(36) NOT NULL DEFAULT 'default-tenant',
    email         VARCHAR(254) NOT NULL, -- en minúsculas y sin espacios
    display_name  VARCHAR(80) NOT NULL,
    password_hash VARCHAR(100) NOT NULL, -- BCrypt; la contraseña nunca se guarda
    role          VARCHAR(20) NOT NULL,
    active        BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_users_tenant_email UNIQUE (tenant_id, email),
    CONSTRAINT ck_users_role CHECK (role IN ('ADMIN', 'EDITOR', 'VIEWER'))
);

-- Tokens de refresco: se guarda el SHA-256 del token, nunca el token. Son de un solo uso:
-- al renovar la sesión se marca `revoked_at` y se emite otro.
CREATE TABLE refresh_tokens (
    token_hash VARCHAR(64) PRIMARY KEY, -- 64 caracteres hexadecimales
    tenant_id  VARCHAR(36) NOT NULL DEFAULT 'default-tenant',
    user_id    VARCHAR(36) NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens (user_id);
