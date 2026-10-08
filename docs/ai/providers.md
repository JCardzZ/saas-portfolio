<!-- rag:skip -->
# Proveedores de IA para el Laboratorio de IA

**Fecha de consulta: 7 de octubre de 2026.** Todo lo de este documento sale de la documentación
oficial de cada proveedor, enlazada en cada apartado. Lo que la documentación no dice se marca
como **sin confirmar**: no se rellena de memoria. Los límites y los modelos cambian a menudo;
antes de tocar la configuración hay que volver a consultar las fuentes y actualizar la fecha.

No es asesoría legal: los apartados de términos resumen lo que dicen las páginas citadas.

## Resumen

| Proveedor | Capa gratuita | ¿Entrena con los prompts? | API | Estado propuesto |
| --- | --- | --- | --- | --- |
| Google Gemini | Sí | **Sí en la capa gratuita** (y pueden leerlos revisores humanos) | Propia (`generateContent`) | Activo, con aviso en la UI |
| Groq | Sí | No | Compatible con OpenAI | Activo |
| OpenRouter (`:free`) | Sí, 50 peticiones/día sin créditos | Depende del proveedor final | Compatible con OpenAI | Activo solo con proveedores que no entrenan |
| Cloudflare Workers AI | Sí, 10 000 neuronas/día | No | REST propia y compatible con OpenAI | Activo |
| GitHub Models | **Retirado** | — | — | Fuera: no se implementa |
| Anthropic (Claude) | No (solo créditos de prueba) | No | Propia (Messages) | Adaptador desactivado sin clave |
| OpenAI | No | No | Propia | Adaptador desactivado sin clave |

## Google Gemini

- **Modelos con capa gratuita** ([precios](https://ai.google.dev/gemini-api/docs/pricing), [modelos](https://ai.google.dev/gemini-api/docs/models)):
  `gemini-3.8-flash`, `gemini-3.7-flash`, `gemini-3.6-flash`, `gemini-3.5-flash`, `gemini-3.5-flash-lite`,
  `gemini-3.1-flash-lite`, `gemini-3-flash-preview`. `gemini-3.1-pro-preview` no tiene capa gratuita.
  Los `gemini-2.5-*` siguen sirviéndose solo a quien ya los usaba; para proyectos nuevos la
  documentación recomienda 3.5 Flash-Lite o 3.8 Flash.
- **`gemini-3.5-flash-lite`** (el que usa hoy la plataforma): entrada 1 048 576 tokens, salida 65 536
  ([ficha](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite)). El contexto de los demás modelos
  está **sin confirmar** (su ficha no se consultó).
- **Límites de la capa gratuita**: la [página de límites](https://ai.google.dev/gemini-api/docs/rate-limits) ya no
  publica cifras; dice que se consultan en Google AI Studio, por proyecto. La cuota diaria se
  reinicia a medianoche, hora del Pacífico. **Las cifras hay que leerlas en AI Studio con la clave
  real**; aquí no se anota ninguna.
- **Embeddings** ([guía](https://ai.google.dev/gemini-api/docs/embeddings)): `gemini-embedding-2` (gratuito). Por
  defecto da 3072 dimensiones; admite `output_dimensionality` de 128 a 3072, con 768 entre los
  valores recomendados, y normaliza él solo los vectores recortados. **Compatible con `vector(768)`.**
  `gemini-embedding-001` sigue disponible para texto; los espacios de ambos modelos son
  incompatibles (cambiar de uno a otro obliga a reindexar).
- **Uso de los datos** ([términos](https://ai.google.dev/gemini-api/terms)): en los servicios no pagados, Google usa lo
  enviado y las respuestas para mejorar sus productos y modelos, y revisores humanos pueden
  leerlo. Los términos piden no enviar información sensible, confidencial ni personal a los
  servicios no pagados. En los de pago no se usa para mejorar productos.
- **Restricción regional**: para ofrecer la aplicación a usuarios del Espacio Económico Europeo,
  Suiza o el Reino Unido solo se pueden usar los servicios de pago. **El sitio es público y puede
  recibir visitas de esas regiones: con la capa gratuita no se cumple esta condición.**
- **Edad**: la aplicación no puede dirigirse a menores de 18 años.
- **Marca**: no se encontró una guía de uso del logo para desarrolladores en la documentación de
  la API. **Sin confirmar.**

## Groq

- **Modelos de producción** ([modelos](https://console.groq.com/docs/models)):

  | ID | Contexto | Salida máx. | Velocidad publicada |
  | --- | ---: | ---: | ---: |
  | `llama-3.1-8b-instant` | 131 072 | 131 072 | 560 tokens/s |
  | `llama-3.3-70b-versatile` | 131 072 | 32 768 | 280 tokens/s |
  | `openai/gpt-oss-120b` | 131 072 | 65 536 | 500 tokens/s |
  | `openai/gpt-oss-20b` | 131 072 | 65 536 | 1 000 tokens/s |

  Los modelos «preview» (`qwen/qwen3.8-27b`, `minimaxai/minimax-m2.7`…) son solo para evaluación y
  pueden retirarse con poco aviso: no se usan.
- **Límites** ([límites](https://console.groq.com/docs/rate-limits)): la tabla publicada da, para `openai/gpt-oss-120b` y
  `openai/gpt-oss-20b`, 30 peticiones/min, 1 000 peticiones/día, 8 000 tokens/min y 200 000
  tokens/día. La página los llama límites base del plan «Developer» y remite a los ajustes de la
  cuenta para los exactos; **los del plan gratuito y los de los modelos Llama están sin
  confirmar**. Las respuestas traen la cuota restante en las cabeceras
  `x-ratelimit-remaining-requests`, `x-ratelimit-remaining-tokens` y sus `-limit-` y `-reset-`.
- **API**: compatible con OpenAI, base `https://api.groq.com/openai/v1`.
- **Datos** ([tus datos](https://console.groq.com/docs/your-data), [acuerdo de servicios](https://console.groq.com/docs/legal/services-agreement)):
  por defecto no retiene los datos de inferencia; puede registrarlos hasta 30 días para fiabilidad
  o abuso, y hay retención cero activable. El acuerdo dice que Groq no puede usar entradas ni
  salidas para entrenar. También dice que los servicios «no son para uso de consumidores» y
  prohíbe usarlos para evitar pagar tarifas: **conviene que lo revises antes de publicar una demo
  abierta al público.**
- **Marca**: no se encontró la guía (la dirección probada no existe). **Sin confirmar.**

## OpenRouter

- **Modelos gratuitos** (lista pública `https://openrouter.ai/api/v1/models`, 16 con sufijo `:free` el día de la
  consulta), entre ellos: `google/gemma-4-31b-it:free` y `google/gemma-4-26b-a4b-it:free` (262 144 de
  contexto), `nvidia/nemotron-3-super-120b-a12b:free` (262 144), `nvidia/nemotron-3.5-lightning:free`
  (1 000 000), `liquid/lfm-2.5-2.6b:free` (65 536). La lista cambia: se consulta al arrancar, no se fija
  en el código.
- **Límites** ([límites](https://openrouter.ai/docs/api-reference/limits)): 20 peticiones/min; 50 peticiones/día con
  menos de 10 créditos comprados, 1 000 al día con 10 o más. `GET https://openrouter.ai/api/v1/key`
  devuelve lo usado y lo que queda (`free_model_daily_requests`).
- **API**: compatible con OpenAI.
- **Datos** ([recogida de datos](https://openrouter.ai/docs/guides/privacy/data-collection),
  [registro por proveedor](https://openrouter.ai/docs/guides/privacy/provider-logging)): OpenRouter no guarda prompts ni
  respuestas salvo que se active. Cada proveedor final tiene su política; con el entrenamiento
  desactivado en la cuenta, OpenRouter no enruta a proveedores que entrenan. **Qué modelos `:free`
  quedan disponibles con esa restricción está sin confirmar** (la documentación no lo detalla).
- **Marca**: la documentación consultada no lo trata. **Sin confirmar.**

## Cloudflare Workers AI

- **Cuota** ([precios](https://developers.cloudflare.com/workers-ai/platform/pricing/)): 10 000 neuronas al día sin
  coste, con reinicio a las 00:00 UTC. En el plan gratuito, al superarla las llamadas fallan con
  error. El coste en neuronas depende del modelo (p. ej. `@cf/meta/llama-3.1-8b-instruct-fp8-fast`:
  4 119 por millón de tokens de entrada y 34 868 de salida; `@cf/openai/gpt-oss-20b`: 18 182 y 27 273).
- **Modelos**: IDs confirmados en la documentación: `@cf/meta/llama-3.1-8b-instruct`,
  `@cf/meta/llama-3.1-8b-instruct-fp8-fast`, `@cf/openai/gpt-oss-20b`, `@cf/openai/gpt-oss-120b`,
  `@cf/qwen/qwen3-30b-a3b-fp8`. El [catálogo](https://developers.cloudflare.com/workers-ai/models/) lista más, pero
  solo por nombre corto: sus IDs completos están **sin confirmar**. Embeddings: `bge-base-en-v1.5`
  da 768 dimensiones.
- **API** ([REST](https://developers.cloudflare.com/workers-ai/get-started/rest-api/),
  [compatibilidad con OpenAI](https://developers.cloudflare.com/workers-ai/configuration/open-ai-compatibility/)):
  `https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run/{modelo}` o, compatible con OpenAI,
  `…/accounts/{account_id}/ai/v1/chat/completions`. Token con permisos «Workers AI - Read» y «Workers AI - Edit».
- **Datos** ([uso de datos](https://developers.cloudflare.com/workers-ai/platform/data-usage/)): Cloudflare no usa el
  contenido del cliente para entrenar los modelos de Workers AI ni para mejorar servicios sin
  consentimiento expreso. No da plazos de retención.
- **Marca** ([marcas](https://www.cloudflare.com/trademark/)): **los logos necesitan permiso escrito** (salvo sus
  insignias web, sin alterar). El nombre sí puede usarse en texto, como adjetivo («servicios de
  Cloudflare»). **Esto afecta a los logos de Cloudflare y Cloudflare Pages que el sitio ya muestra.**

## GitHub Models

La [documentación](https://docs.github.com/en/github-models/use-github-models/prototyping-with-ai-models) dice que
GitHub Models **se ha retirado**: el catálogo, el playground y la API de inferencia ya no están
disponibles para ningún cliente, y remite a Azure AI Foundry. **No se implementa adaptador.**

## Anthropic (Claude)

- **Sin capa gratuita**: la [página de precios](https://platform.claude.com/docs/en/about-claude/pricing) dice que los
  usuarios nuevos reciben una pequeña cantidad de créditos de prueba. Es de pago.
- **Modelos** ([modelos](https://platform.claude.com/docs/en/about-claude/models/overview)), todos con 1 M de contexto y
  128 000 de salida: `claude-haiku-5-5` (desde 0,10 $ / 0,50 $ por millón de tokens de entrada /
  salida), `claude-sonnet-5-5` (2 $ / 10 $), `claude-opus-5-5` (4 $ / 20 $), `claude-fable-5-1` (10 $ / 50 $).
- **Datos** ([centro de privacidad](https://privacy.claude.com/en/articles/7996868-is-my-data-used-for-model-training)):
  por defecto no usa las entradas ni salidas de los productos comerciales (incluida la API) para entrenar.
- **Marca**: no consultada. **Sin confirmar.**
- **Propuesta**: adaptador desactivado mientras no haya `ANTHROPIC_API_KEY`; la UI lo muestra como
  «sin clave configurada».

## OpenAI

- **Sin capa gratuita** para modelos de texto, según la [página de precios](https://developers.openai.com/api/docs/pricing).
  Los más baratos: `gpt-5-nano` (0,05 $ / 0,40 $), `gpt-6-luna` (0,10 $ / 0,50 $), `gpt-4.1-nano` (0,10 $ / 0,40 $).
- **Datos** ([tus datos](https://developers.openai.com/api/docs/guides/your-data)): lo enviado a la API no se usa para
  entrenar salvo que se active; los registros de abuso se guardan hasta 30 días.
- **Marca**: la página de marca no se pudo leer (respondió 403). **Sin confirmar.**
- **Propuesta**: adaptador desactivado mientras no haya `OPENAI_API_KEY`.

## Lo que esto obliga a decidir antes de programar

1. **Gemini gratuito y visitantes europeos.** Los términos no permiten la capa gratuita para
   usuarios del EEE, Suiza o el Reino Unido, y además entrena con los prompts. Opciones: pasar
   Gemini a pago, dejarlo fuera de las preguntas de visitantes (solo para el índice del propio
   contenido) o asumirlo. Hoy el asistente del sitio ya usa Gemini.
2. **Aviso en la UI.** Con Gemini gratuito, la pantalla tiene que decir que la pregunta puede
   usarse para mejorar productos de Google y que no se escriban datos personales.
3. **Groq «no para uso de consumidores».** Hay que decidir si una demo pública encaja.
4. **Logos.** Solo Cloudflare tiene la regla confirmada (y es restrictiva). Para el resto no hay
   guía verificada: la propuesta es mostrar los nombres en texto, sin logos, hasta revisarlas.
5. **Cuotas.** Sin cifras de Gemini ni de Groq gratuito, los topes diarios por proveedor se fijan
   en configuración con valores conservadores y se ajustan al ver las reales en cada consola.
