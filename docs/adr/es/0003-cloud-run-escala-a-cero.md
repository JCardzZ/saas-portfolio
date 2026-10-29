---
number: 0003
slug: cloud-run-escala-a-cero
title: Cloud Run con escala a cero en lugar de un servidor siempre encendido
status: Aceptada
date: 2026-10
area: Infraestructura
summary: La API corre en Cloud Run con facturación por petición, de 0 a 1 instancia, junto a Neon (PostgreSQL) y Upstash (Redis) en sus capas gratuitas, con un corte automático de gasto.
gains: Coste objetivo de 0 $/mes con un peor caso acotado, sin servidores que parchear.
costs: Arranques en frío y CPU solo mientras se atiende una petición, lo que obliga a diseñar el trabajo en segundo plano de otra forma.
revisit: Si el tráfico sostenido acercara el uso al límite gratuito o los arranques en frío empezaran a costar visitas.
evidence: docs/deploy/backend-cloud-run-plan.md, .github/workflows/cd.yml
---

## Contexto

Es un portafolio: tráfico bajo y a ráfagas, sin presupuesto y con una sola persona operándolo. El
objetivo era **0 $ al mes con un tope de gasto acotado**, sin renunciar a una infraestructura que se
pueda defender en una entrevista de plataforma.

## Opciones

| Opción | A favor | En contra / coste |
|---|---|---|
| VPS siempre encendido (el `deploy/` original) | Control total, sin arranques en frío | 24/7 de pago y mantenimiento propio (parches, TLS, copias) |
| Kubernetes gestionado (GKE, AKS) | Estándar de la industria | El plano de control y los nodos cuestan aunque no haya tráfico; desproporcionado |
| Cloud Run con instancias mínimas | Sin arranques en frío | Se paga en reposo |
| **Cloud Run por petición, 0→1 instancia** | Se paga solo mientras atiende; escala a cero | Arranque en frío; CPU solo durante la petición |

## Decisión

Cloud Run en `us-east4` (junto a Neon `aws-us-east-1`), facturación por petición, `--max-instances 1`,
imagen por digest y secretos en Secret Manager. Datos en Neon (PostgreSQL + pgvector) y Upstash
(Redis), ambos en capa gratuita. El peor caso teórico de una instancia ocupada 24/7 rondaría los
66 $/mes (estimado en el plan); lo impiden los límites por IP y un **corte automático**: con 1 $
gastado el servicio deja de aceptar tráfico de Internet, y con 3 $ se desactiva la facturación.

## Consecuencias

**Gana:** coste real de 0 $ o céntimos, despliegues sin tiempo de inactividad (revisión nueva sin
tráfico, prueba de salud y cambio de tráfico) y vuelta atrás instantánea a la revisión anterior.

**Cuesta:** la primera visita tras un rato espera el arranque en frío de Spring Boot y la
reanudación de Neon, y la CPU desaparece al enviar la respuesta (ver ADR 0004). Neon y Upstash son
un punto único de fallo, aceptado para un portafolio.

## Cuándo revisarla

Con tráfico sostenido (instancias mínimas o CPU siempre asignada empiezan a compensar) o si el
arranque en frío hace que el frontend entre en modo demo con frecuencia.
