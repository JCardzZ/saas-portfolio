---
number: 0004
slug: trabajo-largo-dentro-de-la-peticion
title: El reindexado termina dentro de la petición, no en segundo plano
status: Aceptada
date: 2026-10
area: Infraestructura
summary: En Cloud Run con facturación por petición la CPU se retira al responder, así que el reindexado del RAG se hace completo antes de contestar.
gains: Funciona sin pagar CPU permanente ni añadir infraestructura, y un fallo llega al administrador como 503 en vez de perderse en el log.
costs: La petición dura lo que tarda el reindexado (segundos hoy) y depende del timeout del servicio.
revisit: Si el reindexado se acercara al timeout de la petición: el siguiente paso es un Cloud Run job, no la CPU siempre asignada.
evidence: portfolio-backend/src/main/java/dev/portfolio/infrastructure/adapter/in/web/controller/AiRagController.java
---

## Contexto

`POST /admin/ai/rag/reindex` respondía 202 y seguía el trabajo en otro hilo. En producción el
reindexado se quedaba parado en «Loaded 5 source files». La causa, según la documentación de Cloud
Run (*Billing settings*): con facturación por petición **la CPU solo se asigna mientras se procesa
una petición**. Al enviar el 202, el hilo seguía vivo pero casi sin CPU, y la instancia podía
apagarse.

## Opciones

| Opción | A favor | En contra / coste |
|---|---|---|
| CPU siempre asignada (`--no-cpu-throttling`) | Arreglo de una línea | Se paga todo el tiempo encendido; cambia la factura |
| Cloud Tasks | Reintentos incluidos | Otro servicio que configurar y asegurar |
| Cloud Run job | El mejor encaje para trabajos largos | Otra pieza que desplegar y versionar |
| **Terminar dentro de la petición** | Sin coste extra ni infraestructura nueva | La petición dura lo que dure el trabajo |

## Decisión

El controlador hace el reindexado completo y responde al final. Hoy tarda segundos, solo lo lanza el
administrador y el timeout de Cloud Run es de varios minutos. El contrato conserva el 202 y lo
documenta. Gracias a la arquitectura hexagonal (ADR 0001), el cambio no tocó el dominio.

## Consecuencias

**Gana:** cero coste añadido y errores visibles: si falla, el administrador recibe un 503 RFC 7807.

**Cuesta:** la llamada es síncrona y lenta para quien la lanza, y su límite es el timeout del
servicio.

## Cuándo revisarla

Si el corpus crece y el reindexado se acerca al timeout. Entonces, un Cloud Run job con la misma
imagen (diseño ya escrito en el plan de despliegue), no la CPU permanente.
