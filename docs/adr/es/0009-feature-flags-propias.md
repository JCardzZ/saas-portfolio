---
number: 0009
slug: feature-flags-propias
title: Feature flags propias detrás de OpenFeature en lugar de un servicio externo
status: Aceptada
date: 2026-10
area: Producto
summary: Todo lo nuevo llega apagado detrás de una flag guardada en la base de datos, se lee en el frontend a través de OpenFeature y el backend devuelve 404 en sus rutas mientras está apagada.
gains: Integrar a main sin exponer nada y encender o apagar en producción sin desplegar, sin coste ni proveedor nuevo.
costs: Solo encendido o apagado global: sin porcentajes, segmentos ni experimentos.
revisit: Si hicieran falta lanzamientos graduales o experimentos A/B: cambiar el proveedor de OpenFeature sin tocar el código que pregunta por las flags.
evidence: portfolio-backend/src/main/java/dev/portfolio/domain/model/FeatureFlagDomain.java, portfolio-frontend/src/app/core/flags/flag.service.ts
---

## Contexto

Los cambios llegan a main a diario (ADR 0008) y algunos tardan días en estar listos: un rediseño, una
sección nueva, un endpoint. Hacía falta separar **integrar** de **lanzar**, y poder apagar algo en
producción en segundos sin desplegar.

## Opciones

| Opción | A favor | En contra / coste |
|---|---|---|
| Ramas largas hasta terminar | Nada a medias en main | Conflictos y merges enormes |
| Servicio externo (LaunchDarkly, Unleash Cloud…) | Porcentajes, segmentos, auditoría | Otro proveedor y otra factura para un sitio pequeño |
| **Flags propias en la base de datos, leídas con OpenFeature** | Sin coste; estándar abierto en el cliente | Solo encendido o apagado global |

## Decisión

Las flags se declaran en `FeatureFlagDomain` (backend) y en el frontend, empiezan apagadas y se cambian
desde la administración o por API. El backend devuelve 404 en las rutas de una flag apagada
(`FeatureGateConfig`) y el frontend las lee con OpenFeature (`PlatformFlagsProvider`), cacheadas en
Redis en el servidor.

## Consecuencias

**Gana:** lo nuevo entra apagado, se prueba en producción y se enciende cuando está listo; si algo va
mal, se apaga sin desplegar.

**Cuesta:** no hay lanzamientos graduales ni segmentos, y las flags viejas hay que retirarlas a mano
cuando lo nuevo se queda para siempre.

## Cuándo revisarla

Si hicieran falta porcentajes o experimentos. OpenFeature permite cambiar de proveedor sin tocar el
código que consulta las flags.
