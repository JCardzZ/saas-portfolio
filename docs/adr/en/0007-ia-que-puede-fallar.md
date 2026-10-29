---
number: 0007
slug: ia-que-puede-fallar
title: The AI can fail without taking anything down, and its context is data, not instructions
status: Accepted
date: 2026-10
area: AI
summary: Calls to Gemini go through a circuit breaker and usage limits, and the index only holds material that could be public.
gains: A provider failure or exhausted quota only affects the assistant, and one visitor cannot drain everyone's quota.
costs: With the circuit open the assistant answers 503, and the prompt-injection defence is a mitigation, not a guarantee.
revisit: If the assistant became critical (a second provider would be needed) or if the index ever held anything private.
evidence: portfolio-backend/src/main/java/dev/portfolio/infrastructure/adapter/out/ai/GeminiAiAdapter.java, portfolio-backend/src/main/resources/application.yml
---

## Context

The question endpoint is public and depends on an external provider with a limited quota. Everything
indexed ends up in the prompt. Two risks: the AI going down and dragging the rest of the site with it,
and someone using the context (or the endpoint itself) for something it should not do.

## Options

| Option | For | Against / cost |
|---|---|---|
| Call the provider unprotected | Simple | An outage or high latency spreads; one person drains the quota |
| Several providers with failover | More availability | Double integration, double cost, double quality evaluation |
| **Circuit breaker + limits + a trust boundary on the context** | Isolated failure and protected quota | 503 while the circuit is open |

## Decision

Resilience4j: the circuit opens at 50% failures over the last 10 calls, answers an RFC 7807 503
straight away and tries again after 30 s. Lua limits on Redis (ADR 0006): per IP per minute, and a
daily total. Two trust boundaries: only a closed list of extensions enters the index (no dotfiles,
`application*.yml`, `tfvars` or names containing `secret` or `password`), and the system prompt tells
the model to ignore any instruction found inside the chunks (OWASP LLM Top 10, indirect injection).

## Consequences

**Gains:** with Gemini down, the rest of the portfolio is unaffected and the health panel shows it
(circuit state). The provider bill does not depend on a single visitor.

**Costs:** while the circuit is open there is no assistant. The injection mitigation lowers the risk
but does not remove it; that is why the index holds nothing that could not be public.

## When to revisit

If the assistant became a critical part of the product (a second provider behind the same port) or
private content had to be indexed (per-chunk access control).
