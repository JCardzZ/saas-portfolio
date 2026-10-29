---
number: 0001
slug: arquitectura-hexagonal
title: Hexagonal architecture with its rules enforced by ArchUnit
status: Accepted
date: 2026-10
area: Architecture
summary: The domain and use cases are plain Java; Spring, JPA, Redis and Gemini live in adapters, and an architecture test stops that from eroding.
gains: Use cases tested without starting the framework, and providers swapped without touching the core.
costs: More pieces per feature (port, adapter, mapper) and manual registration of every service.
revisit: If the product stays a plain CRUD with no rules of its own, the layers would stop paying for themselves.
evidence: portfolio-backend/src/test/java/dev/portfolio/architecture/HexagonalArchitectureTest.java, portfolio-backend/src/main/java/dev/portfolio/infrastructure/config/UseCaseConfig.java
---

## Context

The platform mixes very different things: a CMS, authentication, RAG over an external AI provider,
caching, usage limits, cost estimates for three clouds and an MCP server. Providers change (the AI,
the serverless database, the cloud) and one person does the work, so the design has to **survive a
provider change without rewriting the logic** and let the rules be tested without infrastructure.

## Options

| Option | For | Against / cost |
|---|---|---|
| Classic Spring layers (controller → service → repository) | Fastest to write; everybody knows it | The domain ends up annotated with JPA and tied to Spring; changing a provider touches the logic |
| Feature modules, no rules | Cohesive per feature | Without an enforced boundary, dependencies cross over time |
| **Hexagonal (ports and adapters) with ArchUnit** | Dependencies point inwards and are checked on every build | More glue code; a learning curve |

## Decision

`domain` and `application` import neither Spring, JPA nor any SDK: use cases only know *ports*.
Adapters (web, persistence, Redis, Gemini, clouds) implement those ports, and services are wired by
hand in `UseCaseConfig`. `HexagonalArchitectureTest` (ArchUnit) makes an import in the wrong
direction **fail CI**, not a code review.

## Consequences

**Gains:** use cases are tested with port doubles, no Spring context. Changing a provider means
writing another adapter: reindexing moved from a background thread to running inside the request
(ADR 0004) without touching the domain.

**Costs:** every feature adds a port, its adapter and a mapper (MapStruct), and every service is
registered by hand. For a simple screen it is more ceremony than a Spring repository.

## When to revisit

If part of the system stays read-and-write with no rules (pure CRUD), it can take a documented
shortcut instead of the four pieces.
