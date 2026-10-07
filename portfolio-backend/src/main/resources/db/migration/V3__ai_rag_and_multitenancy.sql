-- Módulo 2: motor de IA (RAG) y soporte multi-tenant (Shared Database, Discriminator Column)

-- V1 ya habilita la extensión; se repite de forma idempotente porque esta migración depende de ella.
CREATE EXTENSION IF NOT EXISTS "vector";

-- Deuda de multi-tenancy en las tablas existentes. El DEFAULT asigna las filas actuales
-- y las nuevas al tenant por defecto mientras el código no gestione tenants.
ALTER TABLE technologies
    ADD COLUMN tenant_id VARCHAR(36) DEFAULT 'default-tenant' NOT NULL;

ALTER TABLE projects
    ADD COLUMN tenant_id VARCHAR(36) DEFAULT 'default-tenant' NOT NULL;

ALTER TABLE architecture_diagrams
    ADD COLUMN tenant_id VARCHAR(36) DEFAULT 'default-tenant' NOT NULL;

CREATE INDEX idx_technologies_tenant ON technologies (tenant_id);
CREATE INDEX idx_projects_tenant ON projects (tenant_id);
CREATE INDEX idx_architecture_diagrams_tenant ON architecture_diagrams (tenant_id);

-- Fragmentos indexados para RAG. Un fragmento se identifica por tenant + origen + posición,
-- lo que permite reindexar un origen sin duplicarlo.
-- vector(768): dimensión de los embeddings de Gemini usada en EmbeddingDomain.DIMENSIONS.
-- Cambiarla obliga a regenerar todos los embeddings.
CREATE TABLE document_embeddings (
    id          VARCHAR(64) PRIMARY KEY,
    tenant_id   VARCHAR(36) NOT NULL,
    source_id   VARCHAR(512) NOT NULL,
    chunk_index INTEGER NOT NULL,
    content     TEXT NOT NULL,
    metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
    embedding   vector(768) NOT NULL,
    created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_document_embeddings_chunk UNIQUE (tenant_id, source_id, chunk_index)
);

-- Búsqueda aproximada por similitud coseno.
CREATE INDEX idx_document_embeddings_embedding
    ON document_embeddings USING hnsw (embedding vector_cosine_ops);
