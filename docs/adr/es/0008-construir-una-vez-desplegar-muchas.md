---
number: 0008
slug: construir-una-vez-desplegar-muchas
title: Construir una vez y desplegar ese mismo artefacto, firmado
status: Aceptada
date: 2026-10
area: Entrega
summary: La CI construye y verifica una sola vez; el CD despliega exactamente ese build y esa imagen por digest, con firma cosign, sin reconstruir, y vuelve atrás solo si las pruebas de humo fallan.
gains: Lo que llega a producción es lo que se probó, con trazabilidad commit → imagen → revisión → versión, y vuelta atrás en segundos.
costs: Un pipeline más complejo (artefactos, firma, configuración inyectada al desplegar) y escaneos de seguridad que ahora avisan en vez de bloquear.
revisit: Si un escaneo dejara pasar algo grave: volver a bloquear con Trivy en la rama principal o con una lista de excepciones con caducidad.
evidence: .github/workflows/ci.yml, .github/workflows/cd.yml, portfolio-frontend/tools/write-deploy-config.mjs
---

## Contexto

Un despliegue es un cambio en producción, y el riesgo más común no es el código: es desplegar algo
distinto de lo que se probó (otra compilación, otra dependencia, otra configuración). Además había
que poder volver atrás sin reconstruir nada y sin aprobar nada a mano.

## Opciones

| Opción | A favor | En contra / coste |
|---|---|---|
| Compilar en el despliegue | Simple | Lo desplegado no es lo probado; builds no reproducibles |
| Imagen etiquetada `latest` | Fácil de referenciar | Mutable: no se sabe qué se ejecuta |
| **Un build verificado, imagen por digest firmada, configuración por entorno** | Lo probado es lo desplegado; vuelta atrás exacta | Más piezas en el pipeline |

## Decisión

La CI construye el frontend y la imagen del backend una vez, la escanea con Trivy, la firma con cosign
(sin claves, con la identidad del workflow) y publica su SBOM. El CD verifica la firma, copia la imagen
**por digest** a Artifact Registry, crea una revisión sin tráfico, comprueba su salud y le pasa el
tráfico; si las pruebas de humo fallan, el tráfico vuelve solo a la revisión anterior. El frontend es
el mismo artefacto en cada entorno: la URL de la API y la CSP se escriben al desplegar
(`config.json`), sin recompilar. Cada despliegue lleva una versión semántica.

Para que lo nuevo llegue a producción en minutos, los e2e de móvil y Lighthouse informan en los PR sin
bloquear, y Trivy avisa sin frenar la publicación; la batería completa y el escaneo van cada noche.

## Consecuencias

**Gana:** de merge a producción en unos minutos, con firma verificada, versión visible en el sitio y en
`/telemetry/health`, y vuelta atrás en segundos.

**Cuesta:** el pipeline es largo de leer y depende de artefactos con caducidad. Con Trivy sin bloquear,
una vulnerabilidad nueva puede estar en producción hasta el escaneo nocturno: se aceptó a cambio de
no frenar cada despliegue por la imagen base.

## Cuándo revisarla

Si apareciera una vulnerabilidad grave en producción sin detectar a tiempo, o si el sitio pasara a
manejar datos sensibles: volver a hacer bloqueante Trivy en la rama principal.
