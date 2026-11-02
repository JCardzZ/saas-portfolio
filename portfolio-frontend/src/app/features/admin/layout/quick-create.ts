import { Injectable, signal } from '@angular/core';

/**
 * Paleta de creación del panel rediseñado (`admin.redesign`): un recurso se arrastra hasta su
 * sección del menú o hasta el dashboard (o se pulsa) y se crea en un panel lateral, contra la API.
 */
export type CreateKind = 'project' | 'article' | 'technology' | 'user';

/** Tipo MIME propio para que solo los destinos del panel acepten lo que se arrastra. */
export const CREATE_MIME = 'application/x-portfolio-create';

export interface CreateField {
  name: string;
  label: string;
  type: 'text' | 'url' | 'email' | 'password' | 'textarea' | 'select';
  required: boolean;
  placeholder?: string;
  help?: string;
  options?: string[];
  minLength?: number;
  maxLength?: number;
}

export interface CreateKindInfo {
  kind: CreateKind;
  /** Sección del panel en la que vive y cuyo permiso hace falta para crearlo. */
  path: string;
  permission: string;
  label: string;
  title: string;
  fields: CreateField[];
}

export const CREATE_KINDS: readonly CreateKindInfo[] = [
  {
    kind: 'project', path: 'projects', permission: 'cms:write', label: 'Proyecto', title: 'Nuevo proyecto',
    fields: [
      { name: 'title', label: 'Título', type: 'text', required: true, placeholder: 'Plataforma de pagos' },
      { name: 'summary', label: 'Resumen', type: 'textarea', required: true, placeholder: 'Qué resuelve y cómo.' },
      { name: 'githubRepoUrl', label: 'Repositorio de GitHub', type: 'url', required: true, placeholder: 'https://github.com/…' },
      { name: 'technologiesUsed', label: 'Tecnologías', type: 'text', required: false, placeholder: 'Java 21, PostgreSQL', help: 'Separadas por comas.' },
      { name: 'metricsImpact', label: 'Impacto', type: 'text', required: false, placeholder: 'p95 de 80 ms a 12 ms' },
    ],
  },
  {
    kind: 'article', path: 'articles', permission: 'cms:write', label: 'Artículo', title: 'Nuevo artículo',
    fields: [
      { name: 'title', label: 'Título', type: 'text', required: true },
      { name: 'slug', label: 'Slug', type: 'text', required: true, help: 'Se rellena desde el título; es la URL del artículo.' },
      { name: 'contentMarkdown', label: 'Contenido (Markdown)', type: 'textarea', required: true },
    ],
  },
  {
    kind: 'technology', path: 'technologies', permission: 'cms:write', label: 'Tecnología', title: 'Nueva tecnología',
    fields: [
      { name: 'name', label: 'Nombre', type: 'text', required: true, placeholder: 'Kubernetes' },
      { name: 'category', label: 'Categoría', type: 'select', required: true, options: ['Backend', 'Frontend', 'Cloud', 'AI/ML', 'Data', 'DevOps'] },
      { name: 'proficiencyLevel', label: 'Nivel de dominio', type: 'select', required: true, options: ['Experto', 'Avanzado', 'Intermedio'] },
      { name: 'iconUrl', label: 'Icono', type: 'url', required: true, placeholder: 'https://…/icono.svg' },
    ],
  },
  {
    kind: 'user', path: 'users', permission: 'users:manage', label: 'Usuario', title: 'Invitar a alguien',
    fields: [
      { name: 'email', label: 'Correo', type: 'email', required: true },
      { name: 'displayName', label: 'Nombre', type: 'text', required: true },
      { name: 'role', label: 'Rol', type: 'select', required: true, options: ['VIEWER', 'EDITOR', 'ADMIN'] },
      { name: 'password', label: 'Contraseña inicial', type: 'password', required: true, minLength: 12, maxLength: 72, help: 'De 12 a 72 caracteres; se guarda solo su hash.' },
    ],
  },
];

export function createKind(kind: CreateKind): CreateKindInfo {
  return CREATE_KINDS.find((info) => info.kind === kind)!;
}

/** «Hola, mundo» → «hola-mundo»: sin tildes ni signos, para la URL de un artículo. */
export function slugify(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

@Injectable({ providedIn: 'root' })
export class QuickCreateService {
  /** Lo que se está arrastrando: los destinos que lo admiten se iluminan. */
  readonly dragging = signal<CreateKind | null>(null);
  /** Panel lateral abierto para crear esto. */
  readonly open = signal<CreateKind | null>(null);
  /** Cuenta de recursos creados: quien muestra datos vuelve a pedirlos al cambiar. */
  readonly created = signal<{ kind: CreateKind; count: number } | null>(null);

  start(event: DragEvent, kind: CreateKind): void {
    event.dataTransfer?.setData(CREATE_MIME, kind);
    event.dataTransfer?.setData('text/plain', kind);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'copy';
    }
    this.dragging.set(kind);
  }

  end(): void {
    this.dragging.set(null);
  }

  /**
   * Un destino admite lo que se arrastra (`accepts` vacío: cualquier cosa) cancelando el dragover.
   * No devuelve nada a propósito: Angular cancela el evento si un manejador devuelve `false`.
   */
  over(event: DragEvent, accepts?: CreateKind): void {
    const kind = this.dragging();
    if (!kind || (accepts && accepts !== kind)) {
      return;
    }
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
  }

  drop(event: DragEvent, accepts?: CreateKind): void {
    const kind = (event.dataTransfer?.getData(CREATE_MIME) || this.dragging()) as CreateKind | null;
    this.dragging.set(null);
    if (kind && (!accepts || accepts === kind)) {
      event.preventDefault();
      this.open.set(kind);
    }
  }

  done(kind: CreateKind): void {
    this.open.set(null);
    this.created.set({ kind, count: (this.created()?.count ?? 0) + 1 });
  }
}
