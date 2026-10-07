import { HttpErrorResponse, HttpHeaders, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { of, switchMap, throwError, timer } from 'rxjs';

import { runtimeConfig } from '../config/runtime-config';
import { Article, ArticleRequest, Project, ProjectRequest, Technology, TechnologyRequest } from '../api';
import { MOCK_ARTICLES, MOCK_CAREER, MOCK_PROJECTS, MOCK_TECHNOLOGIES, mockRagAnswer } from './mock-data';
// El modo demo sirve las mismas plantillas y el mismo Terraform que el backend, con el código del estudio.
import { catalogRows } from '../../features/public/cloud/cloud-costs.data';
import { mockCopilotAdvice } from '../../features/public/cloud/copilot';
import { CloudLink, CloudNode, CloudProviderId } from '../../features/public/cloud/cloud-topology.data';
import { SERVER_PRESET_IDS, STUDIO_PRESETS } from '../../features/public/cloud/studio-project';
import { generateMainTf, generateVariablesTf } from '../../features/public/cloud/terraform-generator';

/** Retraso artificial para que los estados de carga se vean como con red real. */
export const MOCK_LATENCY_MS = 300;

interface MockResponse {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
}

// Estado en memoria: los cambios del panel admin duran hasta recargar la página.
let technologies: Technology[] = structuredClone(MOCK_TECHNOLOGIES);
let projects: Project[] = structuredClone(MOCK_PROJECTS);
let articles: Article[] = structuredClone(MOCK_ARTICLES);
let nextId = 1;
let savedArchitectures: Record<string, unknown>[] = [];

/**
 * Modo demo: responde a todas las llamadas a la API con datos simulados, sin tocar la red.
 * Solo se registra cuando `runtimeConfig.mockMode` es true.
 */
export const mockApiInterceptor: HttpInterceptorFn = (request, next) => {
  if (!request.url.startsWith(runtimeConfig.apiBaseUrl)) {
    return next(request);
  }
  const path = request.url.slice(runtimeConfig.apiBaseUrl.length);
  const response = route(request.method, path, request.body);

  return timer(MOCK_LATENCY_MS).pipe(
    switchMap(() =>
      response.status >= 400
        ? throwError(() => new HttpErrorResponse({
            status: response.status,
            error: response.body,
            headers: new HttpHeaders(response.headers),
            url: request.url,
          }))
        : of(new HttpResponse({ status: response.status, body: response.body ?? null, url: request.url })),
    ),
  );
};

function route(method: string, path: string, body: unknown): MockResponse {
  const [, resource, id] = /^\/admin\/(technologies|projects)(?:\/([^/]+))?$/.exec(path) ?? [];
  if (resource === 'technologies') {
    return technologiesCrud(method, id, body as TechnologyRequest);
  }
  if (resource === 'projects') {
    return projectsCrud(method, id, body as ProjectRequest);
  }

  const [, scope, projectId] = /^\/(public|admin)\/architecture\/projects(?:\/([^/]+))?$/.exec(path) ?? [];
  if (scope) {
    return architectureProjects(method, scope, projectId, body as Record<string, unknown>);
  }

  switch (`${method} ${path}`) {
    case 'GET /public/architecture/catalog':
      return ok(catalogRows());
    case 'POST /public/architecture/generate-terraform': {
      const topology = body as { cloudProvider: CloudProviderId; nodes: CloudNode[]; connections: CloudLink[] };
      return ok({
        mainTf: generateMainTf(topology.nodes, topology.connections, topology.cloudProvider),
        variablesTf: generateVariablesTf(topology.nodes, topology.cloudProvider),
      });
    }
    case 'GET /public/technologies':
      return ok(technologies);
    case 'GET /public/projects':
      return ok(projects);
    case 'GET /public/career-timeline':
      return ok(MOCK_CAREER);
    case 'GET /public/articles':
      return ok(articles);
    case 'POST /admin/articles':
      return publishArticle(body as ArticleRequest);
    case 'POST /auth/token':
      // Cualquier credencial entra: el token es ficticio y no vale contra el backend real.
      return ok({ accessToken: 'demo.mock.token', expiresInSeconds: 3600 });
    case 'GET /auth/validate':
      return ok({ active: true, subject: 'demo-admin', roles: ['ROLE_ADMIN'] });
    case 'POST /ai/rag/query':
      return ragQuery((body as { prompt?: string } | null)?.prompt ?? '');
    case 'POST /ai/architecture/copilot': {
      const question = body as { prompt?: string; nodes?: CloudNode[] } | null;
      return ok(mockCopilotAdvice(question?.prompt ?? '', question?.nodes ?? []));
    }
    case 'POST /admin/ai/rag/reindex':
      return { status: 202 };
    // La foto de perfil se guarda en el backend: en modo demo se acepta pero no se conserva.
    case 'PUT /admin/profile/photo':
    case 'DELETE /admin/profile/photo':
      return { status: 204 };
    case 'GET /telemetry/health':
      return ok({
        status: 'UP',
        database: 'Demo - Simulada',
        redisCache: 'Demo - Simulada',
        circuitBreakers: { aiEngine: 'CLOSED' },
      });
    default:
      return problem(404, 'RESOURCE_NOT_FOUND', `El modo demo no simula ${method} ${path}`);
  }
}

/** Proyectos del Estudio de arquitectura: las plantillas del backend y lo guardado en esta sesión. */
function architectureProjects(method: string, scope: string, id: string | undefined, body: Record<string, unknown>): MockResponse {
  const presets = SERVER_PRESET_IDS.map((presetId) => {
    const preset = STUDIO_PRESETS.find((candidate) => candidate.id === presetId)!;
    const project = preset.build();
    return {
      id: presetId, title: preset.name, description: preset.description, cloudProvider: project.provider, isPreset: true,
      createdAt: '2026-01-01T00:00:00Z', nodes: project.nodes, connections: project.links, zones: project.zones,
    } as Record<string, unknown>;
  });
  const all = [...presets, ...savedArchitectures];
  const found = all.find((project) => project['id'] === id);

  if (scope === 'public' && method === 'GET') {
    if (!id) {
      return ok(all.map(({ nodes, connections, zones, ...summary }) => summary));
    }
    return found ? ok(found) : problem(404, 'RESOURCE_NOT_FOUND', `No existe el proyecto ${id}`);
  }
  if (scope === 'admin' && method === 'POST' && !id) {
    const created = { ...body, id: `demo-${savedArchitectures.length + 1}`, isPreset: false, createdAt: new Date().toISOString() };
    savedArchitectures = [created, ...savedArchitectures];
    return { status: 201, body: created };
  }
  if (scope === 'admin' && method === 'PUT' && id) {
    if (!found) {
      return problem(404, 'RESOURCE_NOT_FOUND', `No existe el proyecto ${id}`);
    }
    if (found['isPreset']) {
      return problem(400, 'VALIDATION_ERROR', 'Las plantillas no se pueden modificar: guarda el proyecto como uno nuevo');
    }
    const updated = { ...found, ...body };
    savedArchitectures = savedArchitectures.map((project) => (project['id'] === id ? updated : project));
    return ok(updated);
  }
  return problem(404, 'RESOURCE_NOT_FOUND', `El modo demo no simula ${method} en los proyectos de arquitectura`);
}

// Escribir "429" o "503" en la pregunta permite ver cómo se muestran esos errores.
function ragQuery(prompt: string): MockResponse {
  if (prompt.includes('429')) {
    return {
      ...problem(429, 'RATE_LIMIT_EXCEEDED', 'Límite de 10 peticiones excedido'),
      headers: { 'Retry-After': '42', 'X-RateLimit-Limit': '10', 'X-RateLimit-Remaining': '0' },
    };
  }
  if (prompt.includes('503')) {
    return problem(503, 'SERVICE_UNAVAILABLE', 'El motor de IA no está disponible');
  }
  return ok(mockRagAnswer(prompt));
}

function technologiesCrud(method: string, id: string | undefined, request: TechnologyRequest): MockResponse {
  if (method === 'GET' && !id) {
    return ok(technologies);
  }
  if (method === 'POST' && !id) {
    const created: Technology = { ...request, id: `tech-demo-${nextId++}` };
    technologies = [...technologies, created];
    return { status: 201, body: created };
  }
  if (!id || !technologies.some((technology) => technology.id === id)) {
    return problem(404, 'RESOURCE_NOT_FOUND', `Technology con id '${id}' no encontrado`);
  }
  if (method === 'PUT') {
    technologies = technologies.map((technology) => (technology.id === id ? { ...request, id } : technology));
    return { status: 200 };
  }
  if (method === 'DELETE') {
    technologies = technologies.filter((technology) => technology.id !== id);
    projects = projects.map((project) => ({
      ...project,
      technologiesUsed: project.technologiesUsed?.filter((technologyId) => technologyId !== id),
    }));
    return { status: 204 };
  }
  return problem(404, 'RESOURCE_NOT_FOUND', `El modo demo no simula ${method} en tecnologías`);
}

function projectsCrud(method: string, id: string | undefined, request: ProjectRequest): MockResponse {
  if (method === 'GET' && !id) {
    return ok(projects);
  }
  if (method === 'POST' && !id) {
    const created: Project = { ...request, id: `prj-demo-${nextId++}` };
    projects = [...projects, created];
    return { status: 201, body: created };
  }
  if (!id || !projects.some((project) => project.id === id)) {
    return problem(404, 'RESOURCE_NOT_FOUND', `Project con id '${id}' no encontrado`);
  }
  if (method === 'PUT') {
    projects = projects.map((project) => (project.id === id ? { ...request, id } : project));
    return { status: 200 };
  }
  if (method === 'DELETE') {
    projects = projects.filter((project) => project.id !== id);
    return { status: 204 };
  }
  return problem(404, 'RESOURCE_NOT_FOUND', `El modo demo no simula ${method} en proyectos`);
}

// Mismas reglas que el backend: slug en minúsculas con guiones y sin repetir.
function publishArticle(request: ArticleRequest): MockResponse {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(request.slug ?? '')) {
    return problem(400, 'VALIDATION_ERROR', 'El slug solo admite minúsculas, cifras y guiones (p. ej. mi-articulo)');
  }
  if (articles.some((article) => article.slug === request.slug)) {
    return problem(400, 'VALIDATION_ERROR', `Ya existe un artículo con el slug '${request.slug}'`);
  }
  const created: Article = { ...request, id: `art-demo-${nextId++}`, publishedAt: new Date().toISOString() };
  articles = [created, ...articles];
  return { status: 201, body: created };
}

function ok(body: unknown): MockResponse {
  return { status: 200, body };
}

function problem(status: number, code: string, detail: string): MockResponse {
  return { status, body: { status, code, detail, title: detail } };
}

/** Solo para tests: devuelve los datos simulados a su estado inicial. */
export function resetMockApi(): void {
  technologies = structuredClone(MOCK_TECHNOLOGIES);
  projects = structuredClone(MOCK_PROJECTS);
  articles = structuredClone(MOCK_ARTICLES);
  nextId = 1;
  savedArchitectures = [];
}
