/** Cada sección del panel y los permisos con los que se puede entrar en ella. */
export const SECTIONS: readonly { path: string; label: string; permissions: string[] }[] = [
  { path: 'technologies', label: 'Tecnologías', permissions: ['cms:read'] },
  { path: 'projects', label: 'Proyectos', permissions: ['cms:read'] },
  { path: 'articles', label: 'Artículos', permissions: ['cms:read'] },
  { path: 'assistant', label: 'Asistente IA', permissions: ['ai:reindex', 'profile:write'] },
  { path: 'features', label: 'Flags', permissions: ['flags:read'] },
  { path: 'users', label: 'Usuarios', permissions: ['users:manage'] },
];

/**
 * Panel rediseñado (`admin.redesign`): cada sección con su icono (trazos de 24×24), el grupo en que
 * aparece en la barra lateral y una línea que dice para qué sirve.
 */
export const SECTION_META: Record<string, { icon: string; group: 'Contenido' | 'Plataforma'; hint: string; color: string }> = {
  technologies: { color: '#4f8cff', group: 'Contenido', hint: 'El stack que se muestra en la portada', icon: 'M8 6 2 12l6 6M16 6l6 6-6 6' },
  projects: { color: '#f5a524', group: 'Contenido', hint: 'Casos y proyectos publicados', icon: 'M3 7h18v12H3zM8 7V5h8v2' },
  articles: { color: '#22c58b', group: 'Contenido', hint: 'Artículos del blog', icon: 'M5 4h11l3 3v13H5zM9 10h6M9 14h6' },
  assistant: { color: '#a970ff', group: 'Plataforma', hint: 'Lo que sabe la IA del sitio', icon: 'M12 3v3M5 9h14v10H5zM9 14h.01M15 14h.01' },
  features: { color: '#ff5c93', group: 'Plataforma', hint: 'Encender y apagar funcionalidades sin desplegar', icon: 'M4 21V4M4 4h12l-2 4 2 4H4' },
  users: { color: '#22c3e6', group: 'Plataforma', hint: 'Personas, roles y permisos', icon: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M17 11a3 3 0 1 0 0-6M22 21a6 6 0 0 0-4-5.6' },
};
