---
number: 0002
slug: contrato-openapi-primero
title: The OpenAPI contract first, with code generated from it
status: Accepted
date: 2026-10
area: API
summary: The API is designed in a single OpenAPI file; the backend interfaces and the frontend client are generated from it, and CI rejects breaking changes.
gains: Server and client cannot drift apart, and a change that breaks consumers is caught before the merge.
costs: A generation step on every API change and less freedom to improvise an endpoint.
revisit: If the API became internal to a single consumer and the contract added nothing but friction.
evidence: portfolio-api-spec/saas-portfolio-v1.openapi.yaml, .github/workflows/ci.yml
---

## Context

The frontend (Angular) and the backend (Spring Boot) evolve together, and the same API is also used
by the MCP server and the smoke tests. With that many consumers, the risk is not writing the endpoint:
it is **client and server silently disagreeing** until production.

## Options

| Option | For | Against / cost |
|---|---|---|
| Code first, docs generated (springdoc) | No extra steps | The contract is a side effect: it changes by accident and the client is hand-written |
| Hand-shared types | Simple at first | They drift; nothing warns |
| **Contract first (OpenAPI) with generation and breaking-change detection** | One source of truth, reviewable in the PR | A generation step; the contract is designed before coding |

## Decision

`portfolio-api-spec/saas-portfolio-v1.openapi.yaml` is the source of truth. The backend generates
interfaces the controllers implement and the frontend generates its typed client. CI runs Spectral
(style), oasdiff (breaking changes against the target branch) and checks the generated code is up
to date.

## Consequences

**Gains:** a renamed field does not compile on the other side; a breaking change stops the PR before
the merge; RFC 7807 errors, headers and flags are documented in one place.

**Costs:** every API change means editing the YAML and regenerating. Some cases (SSE responses) need
special mappings in the generator.

## When to revisit

If the system split into services with their own contracts, each would get its own; the
contract-first rule would stay.
