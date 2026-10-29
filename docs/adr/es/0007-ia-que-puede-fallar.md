---
number: 0007
slug: ia-que-puede-fallar
title: La IA puede fallar sin tumbar nada, y su contexto es un dato, no una orden
status: Aceptada
date: 2026-10
area: IA
summary: Las llamadas a Gemini pasan por un circuit breaker y por límites de consumo, y el índice solo contiene material que podría ser público.
gains: Un fallo o una cuota agotada del proveedor afectan solo al asistente, y un visitante no puede agotar la cuota de todos.
costs: Con el circuito abierto el asistente responde 503, y la defensa frente a la inyección de prompts es una mitigación, no una garantía.
revisit: Si el asistente pasara a ser crítico (habría que añadir un segundo proveedor) o si el índice incluyera algo privado.
evidence: portfolio-backend/src/main/java/dev/portfolio/infrastructure/adapter/out/ai/GeminiAiAdapter.java, portfolio-backend/src/main/resources/application.yml
---

## Contexto

El endpoint de preguntas es público y depende de un proveedor externo con cuota limitada. Todo lo
indexado acaba en el prompt. Dos riesgos: que la IA caiga y arrastre al resto del sitio, y que alguien
use el contexto (o el propio endpoint) para algo que no debe.

## Opciones

| Opción | A favor | En contra / coste |
|---|---|---|
| Llamar al proveedor sin protección | Simple | Una caída o latencia alta se propaga; una persona agota la cuota |
| Varios proveedores con conmutación | Más disponibilidad | Doble integración, doble coste y doble evaluación de calidad |
| **Circuit breaker + límites + frontera de confianza en el contexto** | Fallo aislado y cuota protegida | 503 cuando el circuito está abierto |

## Decisión

Resilience4j: el circuito se abre con un 50 % de fallos en las últimas 10 llamadas, responde 503 RFC
7807 al instante y vuelve a probar a los 30 s. Límites con Lua en Redis (ADR 0006): por IP y por
minuto, y un total diario. Dos fronteras de confianza: al índice solo entra una lista cerrada de
extensiones (sin dotfiles, `application*.yml`, `tfvars` ni nombres con `secret` o `password`), y el
prompt de sistema ordena ignorar cualquier instrucción dentro de los fragmentos (OWASP LLM Top 10,
inyección indirecta).

## Consecuencias

**Gana:** con Gemini caído, el resto del portafolio sigue igual y el panel de salud lo muestra (estado
del circuito). La factura del proveedor no depende de un solo visitante.

**Cuesta:** mientras el circuito está abierto no hay asistente. La mitigación de la inyección reduce
el riesgo pero no lo elimina; por eso el índice no contiene nada que no pudiera ser público.

## Cuándo revisarla

Si el asistente se volviera parte crítica del producto (segundo proveedor detrás del mismo puerto) o
si hubiera que indexar contenido privado (control de acceso por fragmento).
