# Decisiones de arquitectura (ADR)

Cada decisión que cambia la forma del sistema, su coste o su riesgo queda escrita aquí: qué problema
había, qué opciones se miraron, por qué se eligió una y **qué cuesta**. Se publican en el sitio, en
`/decisiones` (flag `site.adr`), a partir de estos archivos (`tools/generate-adr-data.mjs`).

## Formato

Un archivo por decisión y por idioma: `es/NNNN-slug.md` y `en/NNNN-slug.md`, con la misma
cabecera y el mismo número. La plantilla está en [`template.md`](template.md).

| Campo | Qué es |
|---|---|
| `status` | `Aceptada`, `Propuesta`, `Sustituida por NNNN` o `Retirada` |
| `area` | Arquitectura, API, Infraestructura, Datos, Resiliencia, IA, Entrega o Producto |
| `summary` | La decisión en una frase |
| `gains` / `costs` | Lo que gana y lo que se paga por ello, sin adornos |
| `revisit` | La señal concreta que obligaría a reabrirla |
| `evidence` | Dónde se ve en el código o en producción |

## Reglas

- **Una decisión, un registro.** Si cambia, no se edita la vieja: se escribe una nueva que la
  sustituye y la vieja pasa a `Sustituida por NNNN`.
- **Lo que cuesta va siempre.** Una decisión sin coste escrito no está terminada.
- **Solo hechos comprobables.** Cifras, límites y precios con su fuente; lo estimado se marca como
  estimado. Nada de infraestructura de clientes ni de empleadores.
- **Se revisa en el PR**, como el código: la CI comprueba que el sitio está al día con estos archivos.
