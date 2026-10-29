---
number: 0005
slug: pgvector-en-postgresql
title: pgvector in the same PostgreSQL instead of a separate vector database
status: Accepted
date: 2026-10
area: Data
summary: The RAG embeddings live in PostgreSQL, in a vector(768) column with an HNSW index, next to the CMS data.
gains: One fewer database to run, pay for and secure, and plain SQL queries with the tenant filter.
costs: With approximate indexes the filter applies after the index, and HNSW uses more memory and takes longer to build.
revisit: With many tenants (the filter trap shows up) or millions of chunks, where a dedicated vector database starts to pay off.
evidence: portfolio-backend/src/main/java/dev/portfolio/infrastructure/adapter/out/vector/PgVectorRepositoryAdapter.java
---

## Context

The assistant answers about the projects and the codebase itself, citing `file:lines`. The index is a
few thousand chunks, the budget is zero (ADR 0003) and there already was a PostgreSQL (Neon) with
pgvector on the free tier.

## Options

| Option | For | Against / cost |
|---|---|---|
| Managed vector database (Pinecone, Qdrant…) | Built for this; scales to millions | Another vendor, account, bill and security boundary |
| In-memory index | Very fast | Lost on every cold start (scale to zero) |
| **pgvector in the same PostgreSQL, HNSW, 768 dimensions** | No new pieces; SQL; transactions with the CMS | Filter trap and index memory |

## Decision

A `vector(768)` column with an HNSW index (better speed/recall balance than IVFFlat, per the pgvector
docs) and cosine distance. `gemini-embedding-2` at 768 dimensions (trained with Matryoshka; the index
is a quarter of the size at 3072). Line-based chunks of up to 1800 characters or 60 lines, so answers
can cite line ranges.

## Consequences

**Gains:** RAG is one SQL query with `WHERE tenant_id = ?` and `ORDER BY embedding <=> ?`, with no two
stores to keep in sync.

**Costs:** with approximate indexes pgvector filters *after* walking the index: with many tenants a
query could return fewer than `k` rows (there is one today; noted in the adapter, with
`hnsw.iterative_scan` as the way out). The chunk size is chosen with judgement, not measured.

## When to revisit

With several real tenants (turn on iterative index scans) or a corpus of millions of chunks. Before
tuning parameters: an evaluation set of questions with expected answers.
