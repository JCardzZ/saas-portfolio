---
number: 0008
slug: construir-una-vez-desplegar-muchas
title: Build once and deploy that same signed artifact
status: Accepted
date: 2026-10
area: Delivery
summary: CI builds and verifies once; CD deploys exactly that build and that image by digest, cosign-signed, without rebuilding, and rolls back on its own if the smoke tests fail.
gains: What reaches production is what was tested, traceable commit → image → revision → version, with rollback in seconds.
costs: A more complex pipeline (artifacts, signing, configuration injected at deploy) and security scans that now warn instead of block.
revisit: If a scan let something serious through: make Trivy blocking again on the main branch, or use an expiring exceptions list.
evidence: .github/workflows/ci.yml, .github/workflows/cd.yml, portfolio-frontend/tools/write-deploy-config.mjs
---

## Context

A deploy is a change in production, and the most common risk is not the code: it is deploying
something other than what was tested (another build, another dependency, another configuration). On
top of that, rolling back had to work without rebuilding or approving anything by hand.

## Options

| Option | For | Against / cost |
|---|---|---|
| Build at deploy time | Simple | What is deployed is not what was tested; non-reproducible builds |
| Image tagged `latest` | Easy to reference | Mutable: you do not know what is running |
| **One verified build, image by digest and signed, configuration per environment** | Tested is deployed; exact rollback | More pieces in the pipeline |

## Decision

CI builds the frontend and the backend image once, scans it with Trivy, signs it with cosign
(keyless, with the workflow identity) and publishes its SBOM. CD verifies the signature, copies the
image **by digest** to Artifact Registry, creates a revision without traffic, checks its health and
moves traffic to it; if the smoke tests fail, traffic returns to the previous revision on its own.
The frontend is the same artifact in every environment: the API URL and the CSP are written at
deploy time (`config.json`), without rebuilding. Every deploy carries a semantic version.

To get changes to production in minutes, mobile e2e and Lighthouse report on PRs without blocking,
and Trivy warns without stopping the release; the full battery and the scan run every night.

## Consequences

**Gains:** from merge to production in a few minutes, with a verified signature, a version visible on
the site and in `/telemetry/health`, and rollback in seconds.

**Costs:** the pipeline is long to read and relies on expiring artifacts. With Trivy not blocking, a
new vulnerability can be in production until the nightly scan: accepted in exchange for not stopping
every deploy over the base image.

## When to revisit

If a serious vulnerability reached production undetected, or if the site started handling sensitive
data: make Trivy blocking again on the main branch.
