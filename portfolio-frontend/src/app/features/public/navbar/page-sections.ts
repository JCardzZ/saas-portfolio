/**
 * Secciones de la página, en el orden en que aparecen (experiencia primero; después lo que está en
 * producción y cómo está hecho; Proyectos y Tecnologías, que salen del CMS, solo si tienen contenido). `id` es el ancla de su `<section>` y
 * `labelEn`, su nombre en inglés, y `about`, lo que contiene (lo usa el buscador de la paleta de comandos).
 */
export const PAGE_SECTIONS: readonly { id: string; label: string; labelEn: string; about: string }[] = [
  { id: 'trayectoria', label: 'Trayectoria', labelEn: 'Career', about: 'Trayectoria profesional, experiencia y CV' },
  { id: 'entrega', label: 'Entrega', labelEn: 'Delivery', about: 'Arquitectura en producción, pipeline CI/CD, despliegues y rollback' },
  { id: 'plataforma', label: 'Arquitectura', labelEn: 'Architecture', about: 'Arquitectura en vivo: diagramas C4, consola de eventos, telemetría, resiliencia y multi-tenant' },
  { id: 'cloud', label: 'Cloud', labelEn: 'Cloud', about: 'Estudio de arquitectura multi-cloud: AWS, Azure, Google Cloud, Terraform, FinOps y patrones de datos' },
  { id: 'proyectos', label: 'Proyectos', labelEn: 'Projects', about: 'Proyectos del portafolio' },
  { id: 'tecnologias', label: 'Tecnologías', labelEn: 'Technologies', about: 'Tecnologías y stack' },
  { id: 'articulos', label: 'Artículos', labelEn: 'Articles', about: 'Artículos y notas técnicas' },
];

/**
 * Pestañas de la sección de entrega. `id` es su ancla (`#entrega-pipeline` abre esa pestaña): así la
 * paleta de comandos lleva a cada vista y no solo a la sección.
 */
export const DELIVERY_VIEWS: readonly { id: string; label: string; about: string }[] = [
  { id: 'entrega-arquitectura', label: 'Arquitectura en producción', about: 'Lo desplegado hoy: Cloud Run, Cloudflare Pages, PostgreSQL, Redis, salud en vivo y «Comprobar ahora»' },
  { id: 'entrega-historial', label: 'Historial Git', about: 'Grafo de commits y ramas fusionadas en main, con la CI de cada merge' },
  { id: 'entrega-pipeline', label: 'Pipeline CI/CD', about: 'GitHub Actions: CI, CD y seguridad nocturna, con estados y duraciones reales' },
  { id: 'entrega-despliegues', label: 'Despliegues y rollback', about: 'Línea de tiempo de despliegues, salud y vuelta atrás' },
];
