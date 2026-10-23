import type { Localized } from '../../../core/i18n/language.service';

/** Textos de la estructura de la landing en inglés y español. */
export const LANDING_COPY = {
  heroGreeting: { en: 'Hi, I’m', es: 'Hola, soy' },
  heroTitle: { en: 'Manuel Cardoza', es: 'Manuel Cardoza' },
  heroIntro: {
    en: 'Engineering you can interrogate: projects, technologies and the very code of this platform, with an assistant that answers citing its sources.',
    es: 'Ingeniería que se puede interrogar: proyectos, tecnologías y el propio código de esta plataforma, con un asistente que responde citando sus fuentes.',
  },
  scrollCue: { en: 'Scroll', es: 'Desliza' },
  scrollCueLabel: { en: 'Go to experience', es: 'Ir a la trayectoria' },
  askAi: { en: 'Ask the AI', es: 'Preguntar a la IA' },
  seeProjects: { en: 'See projects', es: 'Ver proyectos' },
  seeCareer: { en: 'See experience', es: 'Ver experiencia' },
  retry: { en: 'Retry', es: 'Reintentar' },
  platformTitle: { en: 'Architecture', es: 'Arquitectura' },
  platformIntro: {
    en: 'How this platform is built inside. Every diagram starts from its real configuration; whatever is simulated says so.',
    es: 'Cómo está construida esta plataforma por dentro. Cada diagrama parte de su configuración real; lo que es simulación lo dice.',
  },
  deliveryTitle: { en: 'Real architecture and delivery', es: 'Arquitectura real y entrega' },
  deliveryIntro: {
    en: 'What is deployed today and how it gets there: topology, CI/CD pipeline and deployments, with real data or marked as planned.',
    es: 'Lo que hay desplegado hoy y cómo llega hasta ahí: topología, pipeline de CI/CD y despliegues, con datos reales o marcados como planificados.',
  },
  deliveryLoading: { en: 'Loading the production architecture…', es: 'Cargando la arquitectura en producción…' },
  cloudTitle: { en: 'Cloud & DevOps', es: 'Cloud & DevOps' },
  cloudIntro: {
    en: 'A studio to draw the same platform on AWS, Google Cloud or Azure, with security checks, indicative cost and a Terraform skeleton.',
    es: 'Un estudio para dibujar la misma plataforma en AWS, Google Cloud o Azure, con comprobaciones de seguridad, coste orientativo y un esqueleto de Terraform.',
  },
  platformLoading: { en: 'Loading the platform diagrams…', es: 'Cargando los diagramas de la plataforma…' },
  cloudLoading: { en: 'Loading the architecture studio…', es: 'Cargando el estudio de arquitectura…' },
  mcpTitle: { en: 'Use my platform from your AI', es: 'Usa mi plataforma desde tu IA' },
  mcpIntro: {
    en: 'What this studio does (validate an architecture, generate Terraform, quote prices, design a system) can also be requested from an AI assistant by connecting it to its MCP server. No tool saves or applies anything.',
    es: 'Lo que hace este estudio (validar una arquitectura, generar Terraform, cotizar, diseñar un sistema) también se puede pedir desde un asistente de IA, conectándolo a su servidor MCP. Ninguna herramienta guarda ni aplica nada.',
  },
  mcpLoading: { en: 'Loading the MCP server section…', es: 'Cargando la sección del servidor MCP…' },
  projectsTitle: { en: 'Projects', es: 'Proyectos' },
  projectsIntro: { en: 'Published work, with its code and the technologies it uses.', es: 'Trabajo publicado, con su código y las tecnologías que usa.' },
  technologiesUsed: { en: 'Technologies used', es: 'Tecnologías usadas' },
  projectCoverAlt: { en: 'Screenshot of', es: 'Captura de' },
  code: { en: 'Code ↗', es: 'Código ↗' },
  noProjects: { en: 'No projects published yet.', es: 'Aún no hay proyectos publicados.' },
  askTitle: { en: 'How is it built?', es: '¿Cómo está construido?' },
  askBody: { en: 'Ask the assistant; it answers with the exact file and lines.', es: 'Pregúntale al asistente; responde con el archivo y las líneas exactas.' },
  technologiesTitle: { en: 'Technologies', es: 'Tecnologías' },
  technologiesIntro: { en: 'The stack I work with, grouped by area.', es: 'El stack con el que trabajo, agrupado por área.' },
  inspectTrace: { en: 'Inspect the trace of ', es: 'Inspeccionar la traza de ' },
  featured: { en: 'Featured', es: 'Destacada' },
  noTechnologies: { en: 'No technologies published yet.', es: 'Aún no hay tecnologías publicadas.' },
  articlesTitle: { en: 'Articles', es: 'Artículos' },
  articlesIntro: { en: 'Technical notes. The assistant can cite them too.', es: 'Notas técnicas. El asistente también puede citarlas.' },
  careerTitle: { en: 'Career', es: 'Trayectoria' },
  careerIntro: { en: 'Experience and education. The downloadable CV comes from this same content.', es: 'Experiencia y formación. El CV descargable sale de este mismo contenido.' },
  footer: {
    en: 'The CV comes from the same document as the timeline and the assistant.',
    es: 'El CV sale del mismo documento que la línea de tiempo y el asistente.',
  },
} satisfies Record<string, Localized>;

/** Credenciales bajo el rol, del perfil de CAREER_STORY.md: no añadir nada que no esté allí. */
export const HERO_CREDENTIALS: readonly Localized[] = [
  { en: '7+ years', es: '+7 años' },
  { en: 'Banking & fintech', es: 'Banca y fintech' },
  { en: 'Java · Spring Boot', es: 'Java · Spring Boot' },
  { en: 'Apigee', es: 'Apigee' },
  { en: 'AWS · Azure · GCP', es: 'AWS · Azure · GCP' },
];
