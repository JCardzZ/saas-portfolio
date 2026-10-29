---
number: 0002
slug: contrato-openapi-primero
title: El contrato OpenAPI primero y el código generado a partir de él
status: Aceptada
date: 2026-10
area: API
summary: La API se diseña en un único archivo OpenAPI; de él se generan las interfaces del backend y el cliente del frontend, y la CI rechaza los cambios incompatibles.
gains: Servidor y cliente no pueden desalinearse, y un cambio que rompe a los consumidores se detecta antes del merge.
costs: Un paso de generación en cada cambio de la API y menos libertad para improvisar un endpoint.
revisit: Si la API pasara a ser interna de un solo consumidor y el contrato no aportara más que fricción.
evidence: portfolio-api-spec/saas-portfolio-v1.openapi.yaml, .github/workflows/ci.yml
---

## Contexto

El frontend (Angular) y el backend (Spring Boot) evolucionan juntos, y la misma API la consumen
también el servidor MCP y las pruebas de humo. Con tantos consumidores, el riesgo no es escribir el
endpoint: es que **cliente y servidor dejen de estar de acuerdo** sin que nadie se entere hasta
producción.

## Opciones

| Opción | A favor | En contra / coste |
|---|---|---|
| Código primero y documentación generada (springdoc) | Sin pasos extra | El contrato es un efecto secundario: cambia sin querer y el cliente se escribe a mano |
| Tipos compartidos a mano | Simple al principio | Se desincronizan; nada avisa |
| **Contrato primero (OpenAPI) con generación y detección de cambios incompatibles** | Una sola fuente de verdad, revisable en el PR | Paso de generación; hay que pensar el contrato antes de programar |

## Decisión

`portfolio-api-spec/saas-portfolio-v1.openapi.yaml` es la fuente de verdad. El backend genera
interfaces que los controladores implementan y el frontend genera su cliente tipado. La CI pasa
Spectral (estilo), oasdiff (cambios incompatibles contra la rama destino) y comprueba que el código
generado está al día.

## Consecuencias

**Gana:** un campo renombrado no compila en el otro lado; un cambio incompatible para el PR antes del
merge; el contrato documenta errores RFC 7807, cabeceras y flags en un solo sitio.

**Cuesta:** cada cambio de la API pasa por editar el YAML y regenerar. Algunos casos (respuestas SSE)
necesitan mapeos especiales en el generador.

## Cuándo revisarla

Si el sistema se partiera en servicios con contratos propios, cada uno tendría el suyo; la regla de
«contrato primero» se mantendría.
