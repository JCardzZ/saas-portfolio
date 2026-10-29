---
number: 0001
slug: arquitectura-hexagonal
title: Arquitectura hexagonal con las reglas comprobadas por ArchUnit
status: Aceptada
date: 2026-10
area: Arquitectura
summary: El dominio y los casos de uso son Java puro; Spring, JPA, Redis y Gemini viven en adaptadores, y un test de arquitectura impide que eso se rompa.
gains: Casos de uso que se prueban sin levantar el framework y proveedores que se cambian sin tocar el núcleo.
costs: Más piezas por funcionalidad (puerto, adaptador, mapper) y registro manual de cada servicio.
revisit: Si el producto se queda en CRUD sin reglas propias, el coste de las capas dejaría de pagarse.
evidence: portfolio-backend/src/test/java/dev/portfolio/architecture/HexagonalArchitectureTest.java, portfolio-backend/src/main/java/dev/portfolio/infrastructure/config/UseCaseConfig.java
---

## Contexto

La plataforma combina cosas muy distintas: un CMS, autenticación, RAG con un proveedor de IA externo,
caché, límites de consumo, estimación de costes en tres nubes y un servidor MCP. Los proveedores
cambian (la IA, la base de datos sin servidor, la nube) y el trabajo lo hace una sola persona, así
que el diseño tiene que **aguantar cambios de proveedor sin reescribir la lógica** y dejar probar
las reglas sin infraestructura.

## Opciones

| Opción | A favor | En contra / coste |
|---|---|---|
| Capas clásicas de Spring (controller → service → repository) | La más rápida de escribir; es lo que conoce cualquiera | El dominio acaba anotado con JPA y acoplado a Spring; cambiar un proveedor toca la lógica |
| Módulos por funcionalidad, sin reglas | Cohesión por funcionalidad | Sin una frontera comprobada, las dependencias se cruzan con el tiempo |
| **Hexagonal (puertos y adaptadores) con ArchUnit** | Dependencias hacia dentro y verificadas en cada build | Más código de unión; curva para quien no lo conoce |

## Decisión

`domain` y `application` no importan Spring, JPA ni ningún SDK: los casos de uso solo conocen
*puertos*. Los adaptadores (web, persistencia, Redis, Gemini, nubes) implementan esos puertos, y los
servicios se registran a mano en `UseCaseConfig`. `HexagonalArchitectureTest` (ArchUnit) hace que una
importación en la dirección equivocada **rompa la CI**, no una revisión de código.

## Consecuencias

**Gana:** los casos de uso se prueban con dobles de los puertos, sin contexto de Spring. Cambiar de
proveedor es escribir otro adaptador: el reindexado pasó de un hilo en segundo plano a ejecutarse
dentro de la petición (ADR 0004) sin tocar el dominio.

**Cuesta:** cada funcionalidad añade un puerto, su adaptador y un mapper (MapStruct), y cada servicio
hay que registrarlo a mano. Para una pantalla simple es más ceremonia que un repositorio de Spring.

## Cuándo revisarla

Si una parte del sistema se queda en lectura y escritura sin reglas (un CRUD puro), se le puede
permitir un atajo documentado en lugar de las cuatro piezas.
