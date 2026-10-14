import type { Localized } from '../../../../core/i18n/language.service';

/**
 * Lo que dice el robot de cada sección: `short` mientras se baja con el scroll; `long` en el
 * recorrido guiado; `items`, los puntos de la lámina holográfica que sostiene. Describe lo que hay en la página (y que es real o simulado), sin inventar datos.
 */
export const GUIDE_SCRIPT: Record<string, { title: Localized; short: Localized; long: Localized; items: { en: string[]; es: string[] } }> = {
  plataforma: {
    items: { en: ['C4 · 4 levels', 'Hexagonal', 'Cache-aside', 'RAG engine'], es: ['C4 · 4 niveles', 'Hexagonal', 'Cache-aside', 'Motor RAG'] },
    title: { en: 'Architecture', es: 'Arquitectura' },
    short: { en: 'This is how it’s built inside.', es: 'Así está hecha por dentro.' },
    long: {
      en: 'This is the platform from the inside: four C4 levels, hexagonal architecture, cache-aside with Redis and a RAG engine. Each diagram comes from its real configuration.',
      es: 'Esta es la plataforma por dentro: cuatro niveles C4, arquitectura hexagonal, caché con Redis y un motor RAG. Cada diagrama sale de su configuración real.',
    },
  },
  entrega: {
    items: { en: ['Topology', 'CI/CD pipeline', 'Deploys', 'Rollback'], es: ['Topología', 'Pipeline CI/CD', 'Despliegues', 'Rollback'] },
    title: { en: 'Delivery', es: 'Entrega' },
    short: { en: 'What’s live, and how it ships.', es: 'Lo que está en producción y cómo llega.' },
    long: {
      en: 'Here is what is deployed today and how it gets there: the topology, the CI/CD pipeline with its real runs, and deployments with rollback.',
      es: 'Aquí ves lo que está desplegado hoy y cómo llega: la topología, el pipeline de CI/CD con sus ejecuciones reales y los despliegues con rollback.',
    },
  },
  cloud: {
    items: { en: ['AWS · GCP · Azure', 'Security checks', 'FinOps', 'Terraform'], es: ['AWS · GCP · Azure', 'Seguridad', 'FinOps', 'Terraform'] },
    title: { en: 'Cloud studio', es: 'Estudio cloud' },
    short: { en: 'Draw it on any cloud.', es: 'Dibújala en cualquier nube.' },
    long: {
      en: 'In this studio you can draw the same platform on AWS, Google Cloud or Azure, with security checks, indicative cost and a Terraform skeleton. Try editing it.',
      es: 'En este estudio puedes dibujar la misma plataforma en AWS, Google Cloud o Azure, con comprobaciones de seguridad, coste orientativo y un esqueleto de Terraform. Prueba a editarlo.',
    },
  },
  mcp: {
    items: { en: ['MCP server', 'Tools', 'Live status', 'Read-only'], es: ['Servidor MCP', 'Herramientas', 'Estado en vivo', 'Solo lectura'] },
    title: { en: 'MCP server', es: 'Servidor MCP' },
    short: { en: 'Use it from your own AI.', es: 'Úsala desde tu propia IA.' },
    long: {
      en: 'Everything the studio does can also be asked from an AI assistant, by connecting it to this MCP server. No tool saves or applies anything.',
      es: 'Todo lo que hace el estudio también se le puede pedir a un asistente de IA, conectándolo a este servidor MCP. Ninguna herramienta guarda ni aplica nada.',
    },
  },
  proyectos: {
    items: { en: ['Real code', 'Stack per project', 'Ask the AI'], es: ['Código real', 'Stack por proyecto', 'Pregúntale a la IA'] },
    title: { en: 'Projects', es: 'Proyectos' },
    short: { en: 'Real work, with its code.', es: 'Trabajo real, con su código.' },
    long: {
      en: 'These are published projects, with their code and the technologies they use. You can ask the assistant how any of them is built.',
      es: 'Estos son proyectos publicados, con su código y las tecnologías que usan. Puedes preguntarle al asistente cómo está hecho cualquiera.',
    },
  },
  tecnologias: {
    items: { en: ['Backend', 'Data', 'Cloud', 'DevOps'], es: ['Backend', 'Datos', 'Cloud', 'DevOps'] },
    title: { en: 'Technologies', es: 'Tecnologías' },
    short: { en: 'My stack, by area.', es: 'Mi stack, por área.' },
    long: {
      en: 'This is the stack I work with, grouped by area. Hover a logo to see its live trace.',
      es: 'Este es el stack con el que trabajo, agrupado por área. Pasa por un logo para ver su traza en vivo.',
    },
  },
  articulos: {
    items: { en: ['Technical notes', 'Cited by the AI'], es: ['Notas técnicas', 'Citadas por la IA'] },
    title: { en: 'Articles', es: 'Artículos' },
    short: { en: 'Notes I’ve written.', es: 'Notas que he escrito.' },
    long: {
      en: 'Technical notes I have written. The assistant can cite them in its answers.',
      es: 'Notas técnicas que he escrito. El asistente puede citarlas en sus respuestas.',
    },
  },
  trayectoria: {
    items: { en: ['Banking', 'Modernisation', 'Cloud', 'CV'], es: ['Banca', 'Modernización', 'Cloud', 'CV'] },
    title: { en: 'Career', es: 'Trayectoria' },
    short: { en: 'Where I’ve been.', es: 'Por dónde he pasado.' },
    long: {
      en: 'And this is my path: banking, modernisation and cloud. The downloadable CV comes from this same content. Thanks for the tour!',
      es: 'Y este es mi recorrido: banca, modernización y nube. El CV descargable sale de este mismo contenido. ¡Gracias por el recorrido!',
    },
  },
};
