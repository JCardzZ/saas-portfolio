# Tipografías del sitio

Archivos `woff2` copiados **sin modificar** (solo renombrados, con la versión en el nombre) de los
paquetes de Fontsource, que redistribuyen las fuentes publicadas en Google Fonts. Descargados el
2026-10-11.

| Familia | Archivo | Origen | Versión | Licencia |
|---|---|---|---|---|
| Inter | `inter/inter-v20-latin-wght.woff2` | `@fontsource-variable/inter` 5.3.0 (`files/inter-latin-wght-normal.woff2`) · https://github.com/rsms/inter | v20 | SIL Open Font License 1.1 (`inter/OFL.txt`) |
| Space Grotesk | `space-grotesk/space-grotesk-v22-latin-wght.woff2` | `@fontsource-variable/space-grotesk` 5.3.0 (`files/space-grotesk-latin-wght-normal.woff2`) · https://github.com/floriankarsten/space-grotesk | v22 | SIL Open Font License 1.1 (`space-grotesk/OFL.txt`) |
| JetBrains Mono | `jetbrains-mono/jetbrains-mono-v24-latin-wght.woff2` | `@fontsource-variable/jetbrains-mono` 5.3.0 (`files/jetbrains-mono-latin-wght-normal.woff2`) · https://github.com/JetBrains/JetBrainsMono | v24 | SIL Open Font License 1.1 (`jetbrains-mono/OFL.txt`) |

SHA-256:

- `inter-v20-latin-wght.woff2`: `3100e775e8616cd2611beecfa23a4263d7037586789b43f035236a2e6fbd4c62`
- `space-grotesk-v22-latin-wght.woff2`: `0640890476fc1198ab4de571fb658de443c4d85b66466ec09534a8737ab1ce9d` (añadida el 2026-10-14, para el nombre y el rol del hero)
- `jetbrains-mono-v24-latin-wght.woff2`: `18be452724bfdc236c074ca94a249a7f41a86752c7d04ab258ce9ed5651f6a7e`

## Qué contienen

- Fuente variable (eje de peso), estilo normal, **subconjunto latino**: cubre el español
  (á é í ó ú ü ñ ¿ ¡ « »). No hay cursiva: el navegador la inclina.
- Los caracteres fuera del subconjunto (flechas como → y ↗, ≈, emoji) los pinta la fuente del sistema;
  el `unicode-range` de `src/styles/fonts.css` lo declara para que no se descargue nada de más.

## Condiciones de la licencia (resumen; el texto completo está en cada `OFL.txt`)

- Se pueden usar, incrustar y redistribuir, también en un sitio comercial, conservando el aviso de
  copyright y la licencia junto a los archivos.
- No se pueden vender por sí solas.
- Una versión modificada no puede usar el nombre reservado de la fuente. Aquí no se modifican.

## Para actualizar una fuente

1. Descargar la nueva versión del paquete y copiar el archivo `latin-wght-normal` y su `LICENSE`.
2. Renombrarlo con la versión nueva (el nombre cambia, así que la caché larga de `/fonts/*` es segura).
3. Actualizar `src/styles/fonts.css`, el `preload` de `src/index.html`, esta tabla y los SHA-256.
