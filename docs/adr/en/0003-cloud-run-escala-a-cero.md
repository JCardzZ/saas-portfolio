---
number: 0003
slug: cloud-run-escala-a-cero
title: Cloud Run scaling to zero instead of an always-on server
status: Accepted
date: 2026-10
area: Infrastructure
summary: The API runs on Cloud Run with request-based billing, 0 to 1 instance, next to Neon (PostgreSQL) and Upstash (Redis) on their free tiers, with an automatic spending cut-off.
gains: A target cost of $0/month with a bounded worst case, and no servers to patch.
costs: Cold starts and CPU only while a request is being served, which forces background work to be designed differently.
revisit: If sustained traffic brought usage close to the free tier, or cold starts started costing visits.
evidence: docs/deploy/backend-cloud-run-plan.md, .github/workflows/cd.yml
---

## Context

It is a portfolio: low, bursty traffic, no budget and a single person running it. The goal was **$0
a month with a bounded spending cap**, without giving up infrastructure that holds up in a platform
interview.

## Options

| Option | For | Against / cost |
|---|---|---|
| Always-on VPS (the original `deploy/`) | Full control, no cold starts | Paid 24/7 plus own maintenance (patches, TLS, backups) |
| Managed Kubernetes (GKE, AKS) | Industry standard | Control plane and nodes cost money with no traffic; out of proportion |
| Cloud Run with minimum instances | No cold starts | Paid while idle |
| **Cloud Run per request, 0→1 instance** | Paid only while serving; scales to zero | Cold start; CPU only during the request |

## Decision

Cloud Run in `us-east4` (next to Neon `aws-us-east-1`), request-based billing, `--max-instances 1`,
image by digest and secrets in Secret Manager. Data in Neon (PostgreSQL + pgvector) and Upstash
(Redis), both on free tiers. The theoretical worst case of one instance busy 24/7 would be around
$66/month (estimated in the plan); per-IP limits and an **automatic cut-off** prevent it: at $1 spent
the service stops accepting Internet traffic, and at $3 billing is disabled.

## Consequences

**Gains:** a real cost of $0 or cents, zero-downtime deploys (new revision without traffic, health
check, traffic switch) and instant rollback to the previous revision.

**Costs:** the first visit after a while waits for Spring Boot's cold start and Neon resuming, and
the CPU goes away once the response is sent (see ADR 0004). Neon and Upstash are a single point of
failure, accepted for a portfolio.

## When to revisit

With sustained traffic (minimum instances or always-on CPU start to pay off) or if cold starts often
push the frontend into demo mode.
