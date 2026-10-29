---
number: 0006
slug: redis-best-effort
title: Redis como caché best-effort que nunca tumba la API
status: Aceptada
date: 2026-10
area: Resiliencia
summary: Cache-aside con TTL y un timeout de 2 s; si Redis falla, la petición se sirve desde PostgreSQL. Los límites de consumo usan un script Lua atómico en el mismo Redis.
gains: Una caída de Redis degrada la velocidad, no la disponibilidad, y los límites por IP son atómicos y compartidos entre instancias.
costs: Datos hasta un TTL desactualizados, más carga en PostgreSQL y límites sin aplicar (fail-open) mientras Redis no responde.
revisit: Si un dato necesitara consistencia fuerte o la carga sin caché pusiera en riesgo la base de datos.
evidence: portfolio-backend/src/main/java/dev/portfolio/infrastructure/adapter/out/cache/RedisCacheAdapter.java, portfolio-backend/src/main/java/dev/portfolio/infrastructure/adapter/out/ratelimit/RedisRateLimiterAdapter.java
---

## Contexto

Redis (Upstash, capa gratuita) acelera las lecturas del CMS y guarda los contadores de los límites
de consumo. Es un servicio externo y gratuito: puede ir lento o caerse. La pregunta es qué pasa
entonces con la API.

## Opciones

| Opción | A favor | En contra / coste |
|---|---|---|
| Caché obligatoria (si falla, error) | Lecturas siempre rápidas o nada | Redis pasa a ser crítico: su caída es la de la API |
| Caché en memoria de cada instancia | Sin dependencia externa | Se pierde al escalar a cero; incoherente entre instancias |
| **Cache-aside best-effort con timeout corto** | La caché acelera pero no es crítica | Datos algo viejos; más carga en la base de datos en un fallo |

## Decisión

Lectura: Redis primero; si no está, PostgreSQL y se guarda con TTL. Escritura: se persiste y se
invalida la clave. Timeout de 2 s: **un fallo de Redis nunca llega al usuario**, se registra un aviso
y se sirve desde la base de datos. Los límites (login, preguntas a la IA, estimaciones) usan un script
Lua atómico: comprobar y sumar es una sola operación, así que dos instancias no pueden saltárselo. Si Redis
cae, el limitador deja pasar las peticiones (*fail-open*) en lugar de bloquear a todo el mundo.

## Consecuencias

**Gana:** la salud del sistema pasa a `DEGRADED`, no a caído; los límites son globales (cambiar de
instancia no regala intentos).

**Cuesta:** una lectura puede estar desactualizada hasta su TTL; con Redis caído, todas las lecturas
van a PostgreSQL y los límites no se aplican hasta que vuelva.

## Cuándo revisarla

Si algún dato exigiera consistencia fuerte (invalidación activa en lugar de TTL) o si la carga sin
caché amenazara a Neon.
