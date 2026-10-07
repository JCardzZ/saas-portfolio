-- Artículos del blog técnico. Lleva tenant_id desde el inicio (Shared Database, Discriminator Column);
-- el slug es único dentro de cada tenant.
CREATE TABLE articles (
    id               VARCHAR(64) PRIMARY KEY,
    tenant_id        VARCHAR(36) NOT NULL DEFAULT 'default-tenant',
    title            VARCHAR(255) NOT NULL,
    slug             VARCHAR(255) NOT NULL,
    content_markdown TEXT NOT NULL,
    published_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_articles_tenant_slug UNIQUE (tenant_id, slug)
);

CREATE INDEX idx_articles_tenant_published ON articles (tenant_id, published_at DESC);
