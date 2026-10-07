-- Catálogo de servicios cloud del Estudio de arquitectura: una fila por servicio y nube.
-- default_monthly_cost es un coste mensual ORIENTATIVO en USD (el tamaño más pequeño razonable
-- en producción), no un precio en vivo: se puede ajustar aquí sin tocar el código.
CREATE TABLE cloud_catalog_items (
    id                   VARCHAR(80) PRIMARY KEY,
    tenant_id            VARCHAR(36) NOT NULL DEFAULT 'default-tenant',
    provider             VARCHAR(16) NOT NULL,
    code                 VARCHAR(48) NOT NULL,
    name                 VARCHAR(80) NOT NULL,
    category             VARCHAR(48) NOT NULL,
    default_monthly_cost NUMERIC(10, 2) NOT NULL DEFAULT 0,
    is_enterprise        BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT uq_cloud_catalog_tenant_provider_code UNIQUE (tenant_id, provider, code)
);

CREATE INDEX idx_cloud_catalog_tenant_provider ON cloud_catalog_items (tenant_id, provider, category);
