-- Proyectos del Estudio de arquitectura: las plantillas que trae la plataforma y los que guarda
-- el administrador. El grafo (nodos, conexiones y zonas) se guarda como JSON: su forma es del
-- editor, que la valida al cargar; aquí solo se limita su tamaño.
CREATE TABLE architecture_projects (
    id               VARCHAR(64) PRIMARY KEY,
    tenant_id        VARCHAR(36) NOT NULL DEFAULT 'default-tenant',
    title            VARCHAR(120) NOT NULL,
    description      VARCHAR(500),
    cloud_provider   VARCHAR(16) NOT NULL,
    nodes_json       TEXT NOT NULL,
    connections_json TEXT NOT NULL,
    zones_json       TEXT NOT NULL,
    is_preset        BOOLEAN NOT NULL DEFAULT FALSE,
    created_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_architecture_projects_tenant_listing ON architecture_projects (tenant_id, is_preset DESC, created_at DESC);
