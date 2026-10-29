---
number: 0005
slug: pgvector-en-postgresql
title: pgvector en la misma PostgreSQL en lugar de una base vectorial aparte
status: Aceptada
date: 2026-10
area: Datos
summary: Los embeddings del RAG viven en PostgreSQL, en una columna vector(768) con índice HNSW, junto a los datos del CMS.
gains: Una base de datos menos que operar, pagar y asegurar, y consultas en SQL normal con el filtro de tenant.
costs: Con índices aproximados el filtro se aplica después del índice, y HNSW ocupa más memoria y tarda más en construirse.
revisit: Con muchos tenants (aparece la trampa del filtro) o con millones de trozos, donde una base vectorial dedicada empieza a compensar.
evidence: portfolio-backend/src/main/java/dev/portfolio/infrastructure/adapter/out/vector/PgVectorRepositoryAdapter.java
---

## Contexto

El asistente responde sobre los proyectos y el propio código citando `archivo:líneas`. El índice son
unos miles de trozos, el presupuesto es cero (ADR 0003) y ya había una PostgreSQL (Neon) con pgvector
disponible en la capa gratuita.

## Opciones

| Opción | A favor | En contra / coste |
|---|---|---|
| Base vectorial gestionada (Pinecone, Qdrant…) | Hecha para esto; escala a millones | Otro proveedor, otra cuenta, otra factura y otra frontera de seguridad |
| Índice en memoria | Rapidísimo | Se pierde con cada arranque en frío (escala a cero) |
| **pgvector en la misma PostgreSQL, HNSW, 768 dimensiones** | Sin piezas nuevas; SQL; transacciones con el CMS | Trampa del filtro y memoria del índice |

## Decisión

Columna `vector(768)` con índice HNSW (mejor equilibrio velocidad/*recall* que IVFFlat, según la
documentación de pgvector) y distancia coseno. `gemini-embedding-2` a 768 dimensiones (entrenado con
Matryoshka; el índice ocupa la cuarta parte que a 3072). Trozos por líneas, de hasta 1800 caracteres
o 60 líneas, para poder citar rangos de líneas.

## Consecuencias

**Gana:** el RAG es una consulta SQL con `WHERE tenant_id = ?` y `ORDER BY embedding <=> ?`, sin
sincronizar dos almacenes.

**Cuesta:** con índices aproximados pgvector filtra *después* de recorrer el índice: con muchos
tenants una consulta podría devolver menos de `k` filas (hoy hay uno; anotado en el adaptador, con
`hnsw.iterative_scan` como salida). El tamaño de trozo está elegido con criterio, no medido.

## Cuándo revisarla

Con varios tenants reales (activar los *iterative index scans*) o un corpus de millones de trozos.
Antes de ajustar parámetros: un conjunto de evaluación con preguntas y respuestas esperadas.
