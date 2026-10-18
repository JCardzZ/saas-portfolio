# Iconos oficiales de servicios cloud

Archivos SVG copiados **sin modificar** (solo renombrados) de los paquetes oficiales:

- `aws/` — AWS Architecture Icons, versión 07312026 (https://aws.amazon.com/architecture/icons/).
  Iconos de servicio de 48 px y el icono de grupo "AWS Cloud" (variante para fondo oscuro).
- `azure/` — Azure Public Service Icons V23 (https://learn.microsoft.com/azure/architecture/icons/).
- `gcp/` — Google Cloud icons (https://cloud.google.com/icons): paquete "core products" (Apigee, AlloyDB,
  Spanner, Vertex AI, Cloud Run, Cloud SQL, GKE, Compute Engine) y paquete "legacy" (Dataflow, Cloud Armor,
  App Engine, Workflows, Artifact Registry), que Google ya no actualiza.

## Condiciones de uso (resumen; revisar las originales antes de publicar)

- Solo para diagramas de arquitectura, material formativo o documentación; aquí se usan en el
  diagrama de la sección "Cloud & DevOps".
- No recortar, voltear, girar ni deformar los iconos, ni cambiarles el color.
- Mostrar siempre el nombre del servicio junto al icono.
- No usarlos para representar un producto o servicio propio.
- Son marcas de Amazon Web Services, de Microsoft y de Google; todos los demás derechos quedan reservados.

Por eso la aplicación los pinta como imagen (`<img>` / `<image>`), sin el giro 3D del resto de logos.
Para añadir un servicio: copiar su SVG aquí y registrarlo en `src/app/shared/ui/tech-icons.ts`.
