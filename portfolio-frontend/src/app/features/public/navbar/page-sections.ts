/**
 * Secciones de la página, en el orden en que aparecen. `id` es el ancla de su `<section>` y
 * `labelEn`, su nombre en inglés, y `about`, lo que contiene (lo usa el buscador de la paleta de comandos).
 */
export const PAGE_SECTIONS: readonly { id: string; label: string; labelEn: string; about: string }[] = [
  { id: 'plataforma', label: 'Arquitectura', labelEn: 'Architecture', about: 'Arquitectura en vivo: diagramas C4, consola de eventos, telemetría, resiliencia y multi-tenant' },
  { id: 'entrega', label: 'Entrega', labelEn: 'Delivery', about: 'Arquitectura en producción, pipeline CI/CD, despliegues y rollback' },
  { id: 'cloud', label: 'Cloud', labelEn: 'Cloud', about: 'Estudio de arquitectura multi-cloud: AWS, Azure, Google Cloud, Terraform, FinOps y patrones de datos' },
  { id: 'proyectos', label: 'Proyectos', labelEn: 'Projects', about: 'Proyectos del portafolio' },
  { id: 'tecnologias', label: 'Tecnologías', labelEn: 'Technologies', about: 'Tecnologías y stack' },
  { id: 'articulos', label: 'Artículos', labelEn: 'Articles', about: 'Artículos y notas técnicas' },
  { id: 'trayectoria', label: 'Trayectoria', labelEn: 'Career', about: 'Trayectoria profesional, experiencia y CV' },
];
