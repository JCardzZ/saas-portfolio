---
number: 0009
slug: feature-flags-propias
title: In-house feature flags behind OpenFeature instead of an external service
status: Accepted
date: 2026-10
area: Product
summary: Everything new ships switched off behind a flag stored in the database, read in the frontend through OpenFeature, and the backend returns 404 on its routes while it is off.
gains: Merge to main without exposing anything and switch features on or off in production without deploying, at no cost and with no new vendor.
costs: Only global on/off: no percentages, segments or experiments.
revisit: If gradual rollouts or A/B experiments were needed: swap the OpenFeature provider without touching the code that asks for flags.
evidence: portfolio-backend/src/main/java/dev/portfolio/domain/model/FeatureFlagDomain.java, portfolio-frontend/src/app/core/flags/flag.service.ts
---

## Context

Changes reach main daily (ADR 0008) and some take days to be ready: a redesign, a new section, an
endpoint. **Integrating** had to be separated from **releasing**, with the ability to switch something
off in production in seconds without a deploy.

## Options

| Option | For | Against / cost |
|---|---|---|
| Long-lived branches until done | Nothing half-finished on main | Conflicts and huge merges |
| External service (LaunchDarkly, Unleash Cloud…) | Percentages, segments, audit | Another vendor and bill for a small site |
| **In-house flags in the database, read through OpenFeature** | Free; open standard on the client | Global on/off only |

## Decision

Flags are declared in `FeatureFlagDomain` (backend) and in the frontend, start switched off and are
changed from the admin or via the API. The backend returns 404 on the routes of a disabled flag
(`FeatureGateConfig`) and the frontend reads them through OpenFeature (`PlatformFlagsProvider`),
cached in Redis on the server.

## Consequences

**Gains:** new work lands switched off, is tested in production and is turned on when ready; if
something goes wrong, it is switched off without deploying.

**Costs:** no gradual rollouts or segments, and old flags have to be removed by hand once the feature
is permanent.

## When to revisit

If percentages or experiments were needed. OpenFeature allows swapping the provider without touching
the code that reads the flags.
