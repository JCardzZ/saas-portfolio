---
number: 0004
slug: trabajo-largo-dentro-de-la-peticion
title: Reindexing finishes inside the request, not in the background
status: Accepted
date: 2026-10
area: Infrastructure
summary: On Cloud Run with request-based billing the CPU is taken away once the response is sent, so the RAG reindex runs to completion before replying.
gains: It works without paying for always-on CPU or adding infrastructure, and a failure reaches the admin as a 503 instead of getting lost in the logs.
costs: The request lasts as long as the reindex (seconds today) and depends on the service timeout.
revisit: If reindexing approached the request timeout: the next step is a Cloud Run job, not always-on CPU.
evidence: portfolio-backend/src/main/java/dev/portfolio/infrastructure/adapter/in/web/controller/AiRagController.java
---

## Context

`POST /admin/ai/rag/reindex` replied 202 and carried on in another thread. In production the reindex
got stuck at «Loaded 5 source files». The cause, per the Cloud Run docs (*Billing settings*): with
request-based billing **CPU is only allocated during request processing**. Once the 202 was sent, the
thread was alive but starved of CPU, and the instance could shut down.

## Options

| Option | For | Against / cost |
|---|---|---|
| Always-on CPU (`--no-cpu-throttling`) | One-line fix | Paid for all the time the instance is up; changes the bill |
| Cloud Tasks | Retries included | Another service to configure and secure |
| Cloud Run job | The best fit for long work | Another piece to deploy and version |
| **Finish inside the request** | No extra cost or infrastructure | The request lasts as long as the work |

## Decision

The controller runs the whole reindex and replies at the end. It takes seconds today, only the admin
triggers it and Cloud Run's timeout is several minutes. The contract keeps and documents the 202.
Thanks to the hexagonal architecture (ADR 0001), the change did not touch the domain.

## Consequences

**Gains:** zero added cost and visible errors: if it fails, the admin gets an RFC 7807 503.

**Costs:** the call is synchronous and slow for whoever triggers it, and the service timeout is its
ceiling.

## When to revisit

If the corpus grows and the reindex approaches the timeout. Then a Cloud Run job with the same image
(design already written in the deployment plan), not always-on CPU.
