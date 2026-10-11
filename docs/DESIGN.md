# Sistema de diseño · sitio público

> **Estado: aprobado el 2026-10-11.** Se aplica por fases (sección 11); la fase 1 (cimientos) deja los tokens, las
> fuentes y las clases base, y las vistas los adoptan en las fases siguientes.
> Alcance: la vista pública (`/`). La administración (`/admin`) sigue clara y se alinea en una fase posterior.

## 1. Principios

1. **Primero quién, después cómo.** En los primeros cinco segundos se lee «Manuel Cardoza» y su rol. Los diagramas son la prueba, no la portada.
2. **Sobrio por defecto.** Superficies neutras, borde de 1 px, un punto de estado. El brillo, el color y el movimiento se reservan para lo que está pasando ahora.
3. **El color significa algo o no está.** Un acento para la interacción; verde, ámbar y rojo solo para estado. Todo lo demás es neutro.
4. **Una sola forma para cada cosa.** Un nodo, una tarjeta, un botón, una consola. El Estudio, «Arquitectura en vivo» y «Arquitectura en producción» hablan el mismo lenguaje.
5. **Real o etiquetado.** Lo simulado, planificado o reproducido lleva su insignia (regla ya vigente del proyecto); el sistema de diseño le da una forma única.
6. **Accesible sin excepciones.** Contraste AA, nada por debajo de 12 px, 44 × 44 px con el dedo, foco visible, y nada que dependa del hover o del color para entenderse.

Este sistema es propio. Las referencias revisadas (sección 12) se usaron para patrones de jerarquía, ritmo y densidad; no se toma el color, la tipografía de marca, el logotipo ni el nombre de ningún producto.

## 2. Color

Los valores son propios y están comprobados con la fórmula de contraste de WCAG 2.1 (`tools/lib/design-tokens.test.mjs` lo exige en la CI). La única fuente es `portfolio-frontend/design-tokens.js`: de ahí salen las utilidades de Tailwind y las variables CSS de `:root` (sección 11.1). **Ningún componente escribe un hex.**

### 2.1 Neutros

| Token | Valor | Uso |
|---|---|---|
| `--bg-canvas` | `#000000` | Fondo de la página (se mantiene el negro puro) |
| `--bg-surface-1` | `#0E0F12` | Tarjetas, consola |
| `--bg-surface-2` | `#16181D` | Nodos, menús, paneles flotantes, campos |
| `--bg-surface-3` | `#1F2229` | Hover, elemento seleccionado, pestaña activa |
| `--border-subtle` | `#23262D` | Borde de 1 px de tarjetas y nodos, separadores |
| `--border-strong` | `#3A3F4A` | Hover de tarjeta o nodo, borde de menús |
| `--border-control` | `#6B7280` | Borde de campos y controles cuyo límite solo lo marca el borde |
| `--text-1` | `#F4F5F7` | Títulos y texto principal |
| `--text-2` | `#A9AFBA` | Texto de apoyo, párrafos de entrada |
| `--text-3` | `#858C99` | Rótulos, metadatos, marcas de tiempo |
| `--text-disabled` | `#565C68` | Solo controles deshabilitados (exentos de contraste) |

### 2.2 Acento y estado

| Token | Valor | Uso |
|---|---|---|
| `--accent-text` | `#6FA8FF` | Enlaces, foco, pestaña o sección activa, selección en un diagrama, pulsos en vivo |
| `--accent-solid` | `#2F6FE4` | Relleno del botón primario (texto blanco) |
| `--accent-solid-hover` | `#2861CC` | Hover del botón primario |
| `--status-ok` | `#4ADE9A` | En producción, sano, correcto |
| `--status-warn` | `#F5B94A` | Degradado, simulación de fallo, aviso |
| `--status-danger` | `#FF7B7B` | Caído, error, acción destructiva |

Fondo de las insignias de color: el propio color al 14 % sobre `--bg-surface-2`.

### 2.3 Contraste comprobado

| Par | Canvas | Surface 1 | Surface 2 | Surface 3 |
|---|---|---|---|---|
| `--text-1` | 19,3 | 17,6 | 16,3 | 14,6 |
| `--text-2` | 9,5 | 8,7 | 8,1 | 7,2 |
| `--text-3` | 6,2 | 5,7 | 5,3 | 4,7 |
| `--accent-text` | 8,7 | 8,0 | 7,4 | 6,6 |
| `--status-ok` | 12,2 | 11,1 | 10,3 | 9,3 |
| `--status-warn` | 11,9 | 10,9 | 10,1 | 9,0 |
| `--status-danger` | 8,4 | 7,6 | 7,1 | 6,4 |
| `--border-control` (no texto, mínimo 3) | 4,3 | 4,0 | 3,7 | 3,3 |

- Blanco sobre `--accent-solid`: 4,65. Sobre su hover: 5,72.
- Texto de insignia sobre su tinte: ok 7,7 · aviso 7,5 · error 5,7 · acento 5,8.
- Todo el texto cumple AA (4,5) en cualquier superficie. `--text-3` es el límite: **no usarlo sobre nada más claro que `surface-3`**.

### 2.4 Reglas

- **Un solo acento.** El acento marca interacción y «ahora»; nunca decora.
- **El estado nunca va solo en el color**: siempre con forma (punto lleno, hueco o borde punteado) y con texto.
- **Colores de marca de terceros**: solo dentro de su propio icono. No tiñen cables, bordes ni cabeceras. Los iconos oficiales de AWS, Azure y Google Cloud siguen sin modificar y con el nombre al lado (`docs/brand-usage.md`).
- **Excepción vigente: el despegue 3D de los logos y su resplandor de marca** (`IconPopLayerComponent`, `.brand-glow`) se mantienen tal como están; no se rediseñan en estas fases. Deben respetar `prefers-reduced-motion` (sección 7). Es la única excepción a «sin resplandores» y a «el color de marca no sale de su icono»; no se extiende a elementos nuevos.
- **Zonas del Estudio** (nube, VPC, subredes, región): borde neutro; se distinguen por el patrón de guiones y su rótulo, no por el color.
- **Sin degradados de color ni texto con degradado.**

## 3. Tipografía

| Familia | Uso | Licencia |
|---|---|---|
| **Inter** (variable, 400–700) | Toda la interfaz | SIL Open Font License 1.1 |
| **JetBrains Mono** (variable, 400–600) | Consola, código, cifras de telemetría, `kbd` | SIL Open Font License 1.1 |

- Inter es la misma familia que ya incrusta el CV en PDF (`portfolio-backend/src/main/resources/cv/fonts`, con su `OFL.txt`): el sitio y el CV comparten letra.
- **Autohospedadas** en `portfolio-frontend/public/fonts/` como `woff2` variable, subconjunto latino (incluye á é í ó ú ñ ¿ ¡), con `font-display: swap` y `preload` solo de Inter. La CSP ya declara `font-src 'self'`: no se carga nada de otros orígenes.
- **Licencia documentada**: `public/fonts/README.md` (origen, versión, fecha de descarga, SHA-256) más el `OFL.txt` de cada familia junto a sus archivos; un test comprueba que no falten. La OFL permite incrustar y redistribuir; no permite vender la fuente sola ni reutilizar su nombre reservado en una versión modificada.
- Pila de reserva: `Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` y `"JetBrains Mono", ui-monospace, Menlo, Consolas, monospace`.
- Cifras: `font-variant-numeric: tabular-nums` en métricas, tablas y marcas de tiempo.

### Escala

Tamaños en `rem` (crecen con el texto ampliado del sistema). **Mínimo absoluto: 12 px**, también dentro de los SVG.

| Rol | Tamaño / interlínea | Peso | Tracking | Uso |
|---|---|---|---|---|
| `display` | 64 / 68 (móvil 40 / 44) | 600 | −0,025em | Nombre en el hero |
| `title-1` | 32 / 40 (móvil 28 / 36) | 600 | −0,02em | Título de sección |
| `title-2` | 20 / 28 | 600 | −0,01em | Título de tarjeta |
| `title-3` | 16 / 24 | 600 | 0 | Subtítulos, nombre de nodo |
| `body-lg` | 18 / 28 | 400 | 0 | Frase de entrada de sección, rol en el hero |
| `body` | 16 / 24 | 400 | 0 | Texto corrido |
| `body-sm` | 14 / 20 | 400 | 0 | Texto de tarjeta, controles |
| `caption` | 12 / 16 | 500 | 0 | Metadatos, insignias |
| `overline` | 12 / 16 | 500 | +0,06em, mayúsculas | Rótulos de columna y de etapa |
| `mono` | 13 / 20 | 400 | 0 | Consola, código |
| `mono-sm` | 12 / 18 | 400 | 0 | Etiquetas de cifra, `kbd` |

Longitud de línea del texto corrido: 60–72 caracteres (`max-w-prose` o 40 rem).

## 4. Espaciado y retícula

Rejilla de 8 px con medio paso de 4 px para ajustes internos.

| Token | px | Uso típico |
|---|---|---|
| `space-1` | 4 | Icono ↔ texto en una insignia |
| `space-2` | 8 | Separación entre controles de un grupo |
| `space-3` | 12 | Título ↔ frase de entrada |
| `space-4` | 16 | Relleno de nodo, separación entre tarjetas en móvil |
| `space-6` | 24 | Relleno de tarjeta, separación entre tarjetas, entre nodos |
| `space-8` | 32 | Cabecera de sección ↔ contenido, relleno de tarjeta grande |
| `space-12` | 48 | Entre columnas de un diagrama |
| `space-16` | 64 | Entre bloques de una misma sección |
| `space-24` | 96 | Entre secciones (móvil) |
| `space-32` | 128 | Entre secciones (escritorio) |

- Contenedor: 1152 px de ancho máximo, márgenes laterales de 24 px (16 px por debajo de 400 px).
- Retícula de 12 columnas con canal de 24 px; las tarjetas ocupan 12, 8 + 4, 6 + 6 o 4 + 4 + 4. **Ninguna fila queda con una tarjeta suelta**: la última se estira hasta cerrar la fila.
- Valores arbitrarios (`p-[13px]`, `mt-[22px]`) no se usan salvo en geometría de diagramas.

## 5. Radios

Escala única. La forma dice qué es cada cosa: **rectángulo redondeado = acción o contenedor; píldora = estado o etiqueta.**

| Token | px | Uso |
|---|---|---|
| `radius-mark` (`rounded-mark`) | 4 | `kbd`, casillas, marcas dentro de una fila |
| `radius-control` (`rounded-control`) | 8 | Botones, campos, nodos de diagrama, pestañas |
| `radius-panel` (`rounded-panel`) | 12 | Menús, paneles flotantes, consola, fichas |
| `radius-card` (`rounded-card`) | 16 | Tarjetas |
| `rounded-full` | 9999 | Insignias, chips, puntos de estado, interruptores |

Un elemento anidado usa un radio menor que el de su contenedor. A pantalla completa (modo teatro) el radio es 0.

## 6. Elevación

Sobre negro, la profundidad se construye con superficie y borde; la sombra solo acompaña a lo que flota.

| Nivel | Superficie | Borde | Sombra | Qué |
|---|---|---|---|---|
| 0 | `canvas` | — | — | Página |
| 1 | `surface-1` | `border-subtle` | — | Tarjetas, consola |
| 2 | `surface-2` | `border-subtle` | — | Nodos, campos, tarjetas dentro de tarjetas |
| 3 | `surface-2` | `border-strong` | `0 16px 40px rgb(0 0 0 / 0.6)` | Menús, paneles flotantes, diálogos |

- **Desenfoque de fondo (`backdrop-filter`) solo en lo que flota sobre contenido**: barra de navegación al desplazar, panel flotante, diálogos, telón del modo teatro. Las tarjetas son opacas (hoy son de vidrio; el desenfoque en decenas de tarjetas cuesta y no se ve sobre negro).
- Sin resplandores (`drop-shadow` de color), salvo la excepción de los logos de la sección 2.4. La selección se marca con borde de acento.
- Capas (`z-index`): contenido 0 · barra 40 · telón de foco 42 · tarjeta enfocada 43 · modo teatro 45 · diálogos y chat 50 · inspector según su modo. Se conservan los valores actuales y se nombran como tokens.

## 7. Movimiento

| Token | Valor | Uso |
|---|---|---|
| `duration-fast` | 120 ms | Hover, pulsación, cambio de color |
| `duration-base` | 200 ms | Menús, pestañas, aparición de fichas |
| `duration-slow` | 320 ms | Paneles, diálogos, efecto genio del inspector |
| `duration-layout` | 480 ms | Modo teatro (FLIP), acople del inspector |
| `ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` | Por defecto |
| `ease-emphasized` | `cubic-bezier(0.16, 1, 0.3, 1)` | Entradas grandes (es la curva de resorte actual) |

- Solo se anima `transform` y `opacity` (excepción ya existente: los guiones de los cables).
- **Hover de tarjeta**: cambia el borde a `border-strong`. Sin elevación ni zoom (hoy `-translate-y-1` y `scale-[1.02]`).
- **Pulsación**: `scale(0.98)` en botones, 120 ms.
- **Entrada de sección**: opacidad + 8 px de desplazamiento, una vez, con escalonado máximo de 60 ms y cuatro elementos.
- **Bucles** (pulsos, partículas, latidos): solo para datos en vivo o simulaciones etiquetadas; se detienen fuera de pantalla (ya lo hace el Estudio) y nunca hay más de uno llamando la atención por pantalla.
- **`prefers-reduced-motion: reduce`**: sin desplazamientos, escalas ni bucles; los cambios de estado son instantáneos o un fundido de 120 ms; los diagramas muestran su estado final; el efecto genio y el FLIP no se ejecutan, y el despegue de un logo aparece ya en su posición final, sin vuelo, giro, órbitas ni chispas (comprobado: sus animaciones quedan en 0,01 ms y una sola vuelta). Se mantiene la regla global actual y cada animación nueva en JavaScript (Web Animations API) comprueba la preferencia por su cuenta, porque la regla CSS no la alcanza.

## 8. Estructura de la página

### 8.1 Barra de navegación

- Marca: **«Manuel Cardoza»** (texto, `title-3`). Sin logotipo.
- Enlaces a **todas** las secciones, en el orden de la página: Arquitectura · Entrega · Cloud · Proyectos · Tecnologías · Artículos · Trayectoria. A la derecha: CV (fantasma) y **«Preguntar a la IA» como acción primaria de la barra**. «Admin» sale de la barra y pasa al pie.
- **Sección activa**: `--text-1` y una línea de 2 px en `--accent-text` bajo el enlace, con `aria-current="true"`. Se calcula con `IntersectionObserver`, no con el evento de scroll.
- Altura 56 px. Transparente sobre el hero; al desplazar, `canvas` al 70 % con desenfoque y borde inferior `border-subtle`.
- Si no caben todos los enlaces, los que sobran pasan a un menú «Secciones» (también en móvil, donde hoy no hay forma de saltar a una sección).

### 8.2 Hero

Orden de lectura, alineado a la izquierda en escritorio y centrado no:

1. `display`: **Manuel Cardoza**
2. `body-lg` en `--text-1`: el rol. **Mientras no cierre la revisión del CV es un marcador temporal**, definido en un único sitio del código y señalado como pendiente; todavía no se toma de `docs/career/CAREER_STORY.md` y no se inventan cargos.
3. `body-lg` en `--text-2`: una frase de propuesta de valor (la actual: «Ingeniería que se puede interrogar…» pasa aquí).
4. Acciones: **«Descargar CV» es la primaria**; «Preguntar a la IA» y «Ver proyectos» son secundarias. Las tres, rectangulares de 40 px.
5. Debajo, enmarcada como producto, la tarjeta «Arquitectura en vivo» asomando en el primer pantallazo.

### 8.3 Cabecera de sección

Toda sección empieza igual: `title-1` + **una frase** en `body-lg` / `--text-2` (máximo 40 rem), con 12 px entre ambas y 32 px hasta el contenido. A la derecha, opcional, un único enlace o acción de la sección. Entre secciones, 128 px (96 en móvil).

### 8.4 Aviso de modo demo

Deja de ser un elemento fijo propio. Es un **segmento de la barra del Inspector de traza** (insignia `warn`: «Modo demo · datos simulados» o «… el servidor no responde»), visible en todos sus modos, incluida la píldora minimizada. Con el inspector cerrado, queda como esa misma píldora en su esquina, dentro del hueco que ya reservan `--dock-right` / `--dock-bottom`. Desaparece `--badge-space`.

## 9. Componentes base

Todos: foco visible con anillo de 2 px en `--accent-text` y 2 px de separación; zona táctil de 44 × 44 px con `pointer: coarse`; texto mínimo de 12 px.

### 9.1 Botón

Rectangular con radio 8 **en todo el sitio, también en el hero**. Clases: `.ui-btn-primary`, `.ui-btn-secondary`, `.ui-btn-ghost`, `.ui-btn-danger`, con `.ui-btn-lg` (40 px) y `.ui-btn-icon` (cuadrado).

| Variante | Fondo | Texto | Borde | Cuándo |
|---|---|---|---|---|
| Primario | `accent-solid` | blanco | — | **Una por vista o por barra** |
| Secundario | `surface-2` | `text-1` | `border-strong` | Acciones habituales |
| Fantasma | transparente | `text-2` → `text-1` | — | Acciones terciarias, iconos, barras densas |
| Destructivo | `surface-2` | `status-danger` | `border-strong` | Quitar, tumbar, restablecer |

- Tamaños: 32 px (barras de herramientas, `body-sm`) y 40 px (hero y diálogos, `body-sm` 500). Relleno horizontal 12 / 16 px. Radio 8.
- Hover: primario → `accent-solid-hover`; el resto → `surface-3`. Deshabilitado: `text-disabled`, sin hover, `aria-disabled`.
- Con icono: 16 px, separación de 8 px. Solo icono: cuadrado, con `aria-label`.
- Un botón que abre menú lleva un cheurón de 12 px a la derecha.

### 9.2 Tarjeta

Opaca: `surface-1`, borde `border-subtle`, radio 16, relleno 24 (32 en tarjetas de ancho completo). Clases: `.ui-card`, `.ui-card-lg`, `.ui-card-interactive`, `.ui-card-inset`. Cabecera: `title-2` a la izquierda, acciones a la derecha (como mucho una insignia y dos botones fantasma). Interactiva: hover con `border-strong`; si toda la tarjeta es un enlace o botón, lo es de verdad en el HTML. Tarjeta dentro de tarjeta: `surface-2`, radio 12.

### 9.3 Insignia

Píldora de 24 px de alto, `caption`, relleno horizontal 8 px, punto opcional de 6 px. Clases: `.ui-badge` (neutra) más `.ui-badge-accent`, `-ok`, `-warn`, `-danger`, y `.ui-badge-dot`.

| Tono | Uso |
|---|---|
| Neutro (`surface-2`, `text-2`, borde `border-subtle`) | Tecnologías, metadatos, «Planificado», «sin estimación» |
| Acento | Seleccionado, «real» (precio de lista en vivo), novedad |
| Ok | «En producción», correcto |
| Aviso | «Simulación», «Reproducción», «Modo demo», degradado |
| Error | Fallo, caído |

Las etiquetas de honestidad («Simulación», «Planificado», «Reproducción») usan **siempre** este componente y el mismo texto en todo el sitio.

### 9.4 Pestañas

- Clases: `.ui-segmented` + `.ui-segment` y `.ui-tabs` + `.ui-tab`; la activa es la que lleva `aria-selected="true"`.
- **Segmentadas** (cambian la vista de una misma tarjeta: niveles C4, AWS / GCP / Azure, perfil de tráfico): contenedor `surface-2` con radio 8 y relleno 2 px; opción de 28 px (44 táctil); activa en `surface-3` con `text-1`; inactivas en `text-2`.
- **Subrayadas** (cambian de contenido: CI / CD / Nightly, paneles `main.tf` / Grafo): texto `body-sm`; activa con `text-1` y línea inferior de 2 px en `--accent-text`.
- `role="tablist"`, flechas para moverse, Inicio y Fin a los extremos.

### 9.5 Barra de herramientas (Estudio)

Una fila, tres zonas:

1. **Izquierda — contexto**: selector de nube (pestañas segmentadas).
2. **Centro — menús agrupados** (botones secundarios con cheurón): **Proyecto** (plantillas, exportar, guardar en la nube, importar, restablecer) · **Ver** (`main.tf`, grafo, auto-ordenar) · **Analizar** (simular caos, auditar la topología). Deshacer y rehacer van a continuación, como iconos fantasma.
3. **Derecha — acciones principales**: **«Editar arquitectura»** (primaria) y **«Co-piloto IA»** (secundaria).

Una sola acción primaria y, como mucho, tres acciones visibles fuera de menús. El perfil de tráfico y los fallos por nodo («Tumbar servicio», «Cargar 100 % CPU») se quedan junto al lienzo, porque actúan sobre el nodo seleccionado. En pantallas estrechas la barra pasa a varias filas; los menús no se funden.

Los menús están siempre en el DOM y se ocultan con `hidden`; abrir uno cierra el anterior, y elegir una acción lo cierra.

### 9.6 Nodo de diagrama

Un solo nodo para «Arquitectura en producción», el pipeline, «Arquitectura en vivo» y el Estudio. Parte del actual de `StageGraphComponent`.

- **Caja**: 52 px de alto mínimo, 200–280 px de ancho, `surface-2`, borde 1 px `border-subtle`, radio 8, relleno 16 px.
- **Contenido**: nombre (`title-3`, 14–16 px) y, debajo, función (`caption`, `text-2`). A la derecha, el **punto de estado** de 8 px.
- **Icono (opcional)**: 20 px a la izquierda, sin modificar y siempre con el nombre al lado. Las vistas de entrega siguen sin logos.
- **Estados**:

| Estado | Borde | Punto | Texto extra |
|---|---|---|---|
| En vivo / sano | `border-subtle` | lleno `status-ok` | — |
| Planificado | punteado `border-strong` | hueco `text-3` | «Planificado» |
| Degradado | `status-warn` | lleno `status-warn` | rótulo (`FAIL-OPEN`, `CB HALF-OPEN`…) |
| Caído | `status-danger` | lleno `status-danger` | rótulo (`CB OPEN`…) |
| Seleccionado | `accent-text`, 1 px + anillo exterior de 2 px al 30 % | sin cambio | — |
| Hover / foco | `border-strong` | sin cambio | — |
| Fuera del camino iluminado | opacidad 40 % | — | — |

- **Datos adjuntos** (coste, aviso de regla): insignia neutra bajo el nodo, nunca encima del borde.
- **Conexiones**: 1 px `border-strong`, en ángulo recto con esquinas redondeadas en las vistas por etapas y en curva en el lienzo libre. Activa: `accent-text`. Planificada: punteada y quieta. Con problema: `status-warn` o `status-danger`. El tipo de conexión (`CDC_STREAM`, `EVENT_BUS`…) se sigue distinguiendo por el patrón de guiones y su rótulo.
- **Pulsos y partículas**: un único color (`accent-text`); en ámbar o rojo solo durante un fallo.
- **Zonas**: `surface-1` al 50 %, borde 1 px neutro (continuo = red, guiones largos = nube, guiones cortos = región), rótulo `overline` en `text-3`.
- Separaciones mínimas vigentes: 48 px entre columnas y 24 px entre nodos.

### 9.7 Panel flotante

Para el Inspector de traza, las fichas de nodo, las propiedades, el copiloto y los menús.

- `surface-2`, borde `border-strong`, radio 12, sombra de nivel 3; desenfoque de fondo solo si flota sobre un diagrama.
- **Cabecera** de 40 px, neutra: título (`body-sm` 500), y a la derecha los controles como botones fantasma de icono. **No se tiñe** con el color de la tecnología: esta se indica con su icono y su nombre en el título.
- Cuerpo con relleno 16 px; pie opcional con las acciones (primaria a la derecha).
- Acoplado, respeta `--dock-right` / `--dock-bottom` y las zonas seguras; por debajo de 640 px de ancho o 500 px de alto es una hoja inferior (reglas vigentes).
- Semáforo del inspector (cerrar, minimizar, maximizar): los tres puntos en neutro (`border-strong`), con `aria-label`; **toman su color (rojo, ámbar, verde) al pasar el cursor por la cabecera o al recibir foco**.

### 9.8 Consola

Para la consola de eventos, el Inspector y las salidas de Terraform.

- `surface-1`, borde `border-subtle`, radio 12. Cabecera de 36 px con el nombre del flujo en `mono-sm`, la insignia de origen («Simulación» o «En vivo») y las acciones (Pausar, Copiar).
- Texto en `mono` (13 / 20). **Cada evento es una fila con columnas alineadas**: hora (`text-3`, cifras tabulares) · nivel · origen · mensaje (`text-1`). Las líneas largas se parten bajo la columna del mensaje, no bajo la hora.
- **Color solo en el nivel**: `INFO` neutro, `OK` verde, `WARN` ámbar, `ERROR` rojo. Los nombres de tecnologías, rutas y cifras van en `text-1`, sin color.
- Evento nuevo: fundido de 120 ms, sin desplazamiento. Sin cursor parpadeante.
- `role="log"` con `aria-live="polite"`; al pausar deja de anunciar. Vacía: una línea en `text-3` que dice qué aparecerá.

## 10. Accesibilidad (resumen de comprobación)

- [ ] Contraste AA en cada par texto/superficie (tabla 2.3).
- [ ] Ningún texto por debajo de 12 px, tampoco dentro de un SVG.
- [ ] Foco visible en todo lo interactivo; orden de tabulación igual al visual.
- [ ] Estado comunicado con forma y texto además de color.
- [ ] 44 × 44 px con el dedo; nada accesible solo con hover.
- [ ] `prefers-reduced-motion` respetado en CSS y en animaciones por JavaScript.
- [ ] Cabe a 320 px y con el texto al 200 %.
- [ ] Reglas vigentes de móviles: alturas en `dvh` / `svh`, zonas seguras, `--dock-*`.

## 11. Aplicación por fases

Una rama y un PR por fase, cada uno con capturas antes y después (escritorio, tablet y móvil), Lighthouse y tests en verde.

1. **Cimientos**: tokens en `design-tokens.js` y `tailwind.config.js`, fuentes autohospedadas con su licencia, componentes base (`.ui-btn-*`, `.ui-card`, `.ui-badge`, pestañas). Sin cambios de estructura: lo único que se ve es la letra nueva.
2. **Página**: hero y marca con el nombre, cabeceras de sección, barra con todas las secciones y la activa, rejilla de proyectos, aviso de demo en el inspector.
3. **Diagramas**: nodo único en «Arquitectura en vivo» y en el Estudio, zonas y cables neutros, consola e inspector.
4. **Estudio**: barra de herramientas con menús agrupados.
5. **Limpieza**: retirar hex sueltos, `text-[9|10|11px]`, radios fuera de escala y la clase `.glass` de las tarjetas. Un test o regla de lint impide que vuelvan.

Cada fase pasa `ng test`, la matriz de Playwright (móvil y escritorio) y Lighthouse. Las capturas de `e2e-screens/` sirven de antes y después.

### 11.1 Dónde vive cada cosa

| Qué | Dónde |
|---|---|
| Valores de los tokens (única fuente) | `portfolio-frontend/design-tokens.js` |
| Utilidades de Tailwind y variables CSS de `:root` | `portfolio-frontend/tailwind.config.js` |
| `@font-face` | `portfolio-frontend/src/styles/fonts.css` |
| Archivos de fuente y licencias | `portfolio-frontend/public/fonts/` |
| Clases base `ui-*` | `portfolio-frontend/src/styles.css` (`@layer components`) |
| Test de contraste, mínimos y licencias | `portfolio-frontend/tools/lib/design-tokens.test.mjs` (`npm run test:tools`) |

Nombres en Tailwind: fondos `bg-canvas`, `bg-surface-1|2|3`; bordes `border-line-subtle|strong|control`; texto `text-ink-1|2|3|disabled`; acento `text-accent-text`, `bg-accent-solid`, `bg-accent-solid-hover`; estado `text-status-ok|warn|danger`; tipografía `text-display`, `text-title-1`… `text-mono-sm`; radios `rounded-mark|control|panel|card`; sombra `shadow-floating`; movimiento `duration-fast|base|slow|layout`, `ease-standard|emphasized`; capas `z-nav`, `z-theater`, `z-dialog`. El espaciado usa la escala de Tailwind (`space-6` = clase `6` = 24 px).

Las clases `.btn`, `.card` e `.input` sin prefijo son las de la administración. `accent` y `accent-hover` (el azul anterior) y `ease-spring` siguen disponibles hasta que la fase 5 retire su último uso.

## 12. Referencias revisadas

Capturadas y medidas el 2026-10-11 a 1440 px, solo sus páginas públicas. Se usan como patrones; no se copia identidad.

| Sitio | Patrón que se adopta | Lo que no se toma |
|---|---|---|
| linear.app | Hero a la izquierda con el producto enmarcado debajo; sección = título + párrafo de apoyo; barra de 1 px que marca el límite; texto de apoyo en gris medio | Su paleta, su logotipo, los titulares bicolor, la densidad de producto colaborativo |
| axiom.co | Monoespaciada para datos y sans para la interfaz; una sola acción rellena por barra; tablas y fichas con filas separadas por líneas de 1 px; controles de ventana en gris | Su acento, las líneas diagonales decorativas, botones de 28 px (pequeños para el dedo) |
| brittanychiang.com | Nombre, rol y una frase antes que nada; navegación que marca la sección activa; trayectoria con la fecha en columna propia y chips de tecnología | Su fondo azulado, el foco de luz que sigue al cursor, la disposición en dos columnas fijas |

También revisados, sin adoptar nada concreto: vercel.com, resend.com, railway.com, temporal.io, planetscale.com, supabase.com, warp.dev, grafana.com (su portada es hoy clara) y rauno.me (claro).

## 13. Decisiones tomadas (2026-10-11)

1. **Hero**: «Descargar CV» es la acción primaria; en la barra lo es «Preguntar a la IA».
2. **Botones rectangulares (radio 8) en todo el sitio**, también en el hero. Rectángulo = acción; píldora = estado.
3. **Despegue 3D y resplandor de los logos**: se mantienen como están (excepción de la sección 2.4), respetando `prefers-reduced-motion`.
4. **Semáforo del inspector**: neutro, con color al pasar el cursor o con foco.
5. **Tarjetas opacas**; vidrio solo en la barra, los diálogos y los paneles flotantes.
6. **Monoespaciada**: JetBrains Mono.
7. **Aviso de modo demo**: segmento de la barra del Inspector de traza (sección 8.4).
8. **Rol del hero**: marcador temporal hasta que cierre la revisión del CV.
