---
number: 0006
slug: redis-best-effort
title: Redis as a best-effort cache that never brings the API down
status: Accepted
date: 2026-10
area: Resilience
summary: Cache-aside with a TTL and a 2 s timeout; if Redis fails, the request is served from PostgreSQL. Usage limits use an atomic Lua script on the same Redis.
gains: A Redis outage costs speed, not availability, and per-IP limits are atomic and shared across instances.
costs: Data up to one TTL stale, more load on PostgreSQL while Redis is down, and limits fail open until it returns.
revisit: If some data needed strong consistency or the uncached load put the database at risk.
evidence: portfolio-backend/src/main/java/dev/portfolio/infrastructure/adapter/out/cache/RedisCacheAdapter.java, portfolio-backend/src/main/java/dev/portfolio/infrastructure/adapter/out/ratelimit/RedisRateLimiterAdapter.java
---

## Context

Redis (Upstash, free tier) speeds up CMS reads and holds the usage-limit counters. It is an external,
free service: it can be slow or go down. The question is what happens to the API then.

## Options

| Option | For | Against / cost |
|---|---|---|
| Mandatory cache (fail if it fails) | Reads are always fast or nothing | Redis becomes critical: its outage is the API's |
| Per-instance in-memory cache | No external dependency | Lost when scaling to zero; inconsistent across instances |
| **Best-effort cache-aside with a short timeout** | The cache speeds things up without being critical | Somewhat stale data; more database load during an outage |

## Decision

Read: Redis first; if missing, PostgreSQL and store with a TTL. Write: persist, then invalidate the
key. A 2 s timeout: **a Redis failure never reaches the user**, a warning is logged and the database
serves the request. Limits (login, AI questions, estimates) use an atomic Lua script: checking and
counting is a single operation, so two instances cannot get around it. If Redis is down, the limiter
lets requests through (fail-open) rather than blocking everyone.

## Consequences

**Gains:** system health goes to `DEGRADED`, not down; limits are global (switching instance grants
no extra attempts).

**Costs:** a read can be stale up to its TTL; with Redis down, every read hits PostgreSQL and limits
are not enforced until it comes back.

## When to revisit

If some data required strong consistency (active invalidation instead of TTL) or if the uncached load
threatened Neon.
