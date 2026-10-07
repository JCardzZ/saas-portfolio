-- Extensiones para UUID y Búsqueda Vectorial (RAG)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- Tabla de Tecnologías
CREATE TABLE IF NOT EXISTS technologies (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL,
    proficiency_level VARCHAR(100) NOT NULL,
    icon_url TEXT NOT NULL,
    is_featured BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Proyectos
CREATE TABLE IF NOT EXISTS projects (
    id VARCHAR(64) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    summary TEXT NOT NULL,
    github_repo_url TEXT NOT NULL,
    demo_video_url TEXT,
    metrics_impact TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Diagramas C4
CREATE TABLE IF NOT EXISTS architecture_diagrams (
    id VARCHAR(64) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    c4_level VARCHAR(50) NOT NULL,
    mermaid_script TEXT NOT NULL,
    excalidraw_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
