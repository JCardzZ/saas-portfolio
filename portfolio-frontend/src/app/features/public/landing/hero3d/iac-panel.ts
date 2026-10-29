import { siAngular, siCloudflare, siGithubactions, siGooglecloud, siGooglegemini, siPostgresql, siRedis, siSpringboot } from 'simple-icons';

import type { ScenePalette } from './hero-scene';

/**
 * Panel de infraestructura del holograma (flag `site.refresh`): lo que el robot «está escribiendo»
 * es la plataforma real. Tres fases en bucle:
 *   1. `main.tf`: la infraestructura como código, con la imagen desplegada de verdad.
 *   2. `deploy #N`: el último despliegue real del CD (pipeline-status.json), job a job con su tiempo.
 *   3. `live`: el mapa de lo que está en producción, con el estado y la latencia de `/telemetry/health`
 *      y un paquete por cada evento real que llega del backend (SSE).
 * Sin datos (modo demo o sin red), cada pieza lo dice: nada se inventa.
 */
export interface IacLive {
  /** Estado de la API: `demo` sin backend; `down` sin respuesta. */
  api: 'up' | 'degraded' | 'down' | 'demo' | 'loading';
  latencyMs: number | null;
  /** Versión desplegada del sitio (version.json) y de la API (/telemetry/health). */
  siteVersion: string | null;
  apiVersion: string | null;
  sha: string | null;
  database: boolean | null;
  cache: boolean | null;
  /** Estado del circuito hacia Gemini (CLOSED = sano). */
  ai: string | null;
  /** Último despliegue del CD y última CI, de pipeline-status.json. */
  cd: { run: number; seconds: number | null; jobs: { id: string; seconds: number | null; ok: boolean | null }[] } | null;
  ci: { run: number; ok: boolean } | null;
  /** Eventos reales recientes (ms de `performance.now()` en que llegaron y a qué pieza van). */
  events: { at: number; target: 'cache' | 'db' | 'ai' | 'api' }[];
}

const PHASES = [6, 5.5, 10];
export const IAC_CYCLE = PHASES.reduce((a, b) => a + b, 0);

const BRAND = { gh: siGithubactions, ng: siAngular, cf: siCloudflare, run: siGooglecloud, sb: siSpringboot, pg: siPostgresql, rd: siRedis, gm: siGooglegemini };
type NodeId = keyof typeof BRAND;
const NODES: { id: NodeId; title: string; c: number; r: number }[] = [
  { id: 'gh', title: 'GitHub Actions', c: 0, r: 0 },
  { id: 'ng', title: 'Angular', c: 0, r: 1.5 },
  { id: 'cf', title: 'Cloudflare Pages', c: 1, r: 1.5 },
  { id: 'run', title: 'Cloud Run', c: 2, r: 0.5 },
  { id: 'sb', title: 'Spring Boot', c: 2, r: 1.85 },
  { id: 'pg', title: 'PostgreSQL', c: 3, r: 0.4 },
  { id: 'rd', title: 'Redis', c: 3, r: 1.45 },
  { id: 'gm', title: 'Gemini', c: 3, r: 2.5 },
];
const LINKS: [NodeId, NodeId, boolean][] = [['ng', 'cf', false], ['cf', 'sb', false], ['run', 'sb', false], ['sb', 'pg', false], ['sb', 'rd', false], ['sb', 'gm', false], ['gh', 'cf', true], ['gh', 'run', true]];
const EVENT_LINK: Record<IacLive['events'][number]['target'], [NodeId, NodeId]> = { cache: ['sb', 'rd'], db: ['sb', 'pg'], ai: ['sb', 'gm'], api: ['cf', 'sb'] };
const JOB_LABEL: Record<string, string> = {
  source: 'Origen · firma cosign', 'frontend-deploy': 'Cloudflare Pages', deploy: 'Cloud Run', smoke: 'Health + smoke', release: 'Release semver', rollback: 'Rollback',
};

const icons = new Map<NodeId, Path2D>();
function icon(id: NodeId): Path2D {
  let path = icons.get(id);
  if (!path) { path = new Path2D(BRAND[id].path); icons.set(id, path); }
  return path;
}

/** Color de marca del logo; si es casi negro (Angular, en Simple Icons), el del texto, para que se vea en los dos temas. */
function brandColor(id: NodeId, colors: ScenePalette): string {
  const hex = BRAND[id].hex;
  const luminance = (parseInt(hex.slice(0, 2), 16) * 299 + parseInt(hex.slice(2, 4), 16) * 587 + parseInt(hex.slice(4, 6), 16) * 114) / 1000;
  return luminance < 60 ? colors.ink : `#${hex}`;
}

const ease = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : 1 - Math.pow(1 - t, 3));
const short = (sha: string | null) => (sha ? sha.slice(0, 7) : null);

/** Qué fase toca en el segundo `time` del bucle y cuánto lleva en ella. */
export function iacPhase(time: number): [phase: 0 | 1 | 2, t: number] {
  let t = ((time % IAC_CYCLE) + IAC_CYCLE) % IAC_CYCLE;
  let phase = 0;
  while (phase < 2 && t > PHASES[phase]) { t -= PHASES[phase]; phase++; }
  return [phase as 0 | 1 | 2, t];
}

/** Estado de cada nodo del mapa: `true` sano, `false` con fallos, `null` sin dato. */
export function nodeHealth(id: NodeId, live: IacLive): boolean | null {
  const reachable = live.api === 'up' || live.api === 'degraded';
  switch (id) {
    case 'sb': case 'run': return live.api === 'down' ? false : reachable ? true : null;
    case 'pg': return reachable ? live.database : null;
    case 'rd': return reachable ? live.cache : null;
    case 'gm': return reachable && live.ai ? live.ai === 'CLOSED' : null;
    case 'gh': return live.ci ? live.ci.ok : null;
    case 'cf': return live.siteVersion ? true : null;
    default: return live.siteVersion ? true : null;
  }
}

/** Segunda línea de cada nodo: el dato vivo que le corresponde. */
export function nodeDetail(id: NodeId, live: IacLive): string {
  const demo = live.api === 'demo';
  switch (id) {
    case 'gh': return live.ci ? `CI #${live.ci.run} ${live.ci.ok ? '✓' : '✗'}` : 'CI/CD';
    case 'ng': return 'SPA';
    case 'cf': return live.siteVersion ? `${live.siteVersion} · edge` : 'CDN · edge';
    case 'run': return live.apiVersion ? `${live.apiVersion} · us-east4` : 'us-east4';
    case 'sb': return live.latencyMs !== null ? `API · ${live.latencyMs} ms` : demo ? 'modo demo' : 'API REST';
    case 'pg': return live.database === false ? 'sin conexión' : 'Neon · pgvector';
    case 'rd': return live.cache === false ? 'degradado' : 'Upstash · caché';
    case 'gm': return live.ai && live.ai !== 'CLOSED' ? `circuito ${live.ai}` : 'RAG';
  }
}

/** Pinta el panel en el lienzo del holograma (1024 × 640). `time` en segundos; `now` = `performance.now()`. */
export function paintIacPanel(ctx: CanvasRenderingContext2D, W: number, H: number, time: number, now: number, colors: ScenePalette, live: IacLive): void {
  const light = colors.light;
  const ink = colors.ink, muted = colors.muted, line = light ? 'rgba(10,20,12,0.18)' : 'rgba(255,255,255,0.08)';
  const ok = colors.ok ?? colors.accentText, warn = colors.warn ?? colors.muted, bad = colors.danger ?? colors.muted;
  // Resaltado de sintaxis con los tokens del sitio: palabras clave en el acento, cadenas en «sano».
  const syntax = { kw: colors.accentText, ty: ink, str: ok, at: ink, pn: muted, cm: muted };
  const [phase, t] = iacPhase(time);
  ctx.clearRect(0, 0, W, H);

  // Ventana: vidrio, borde con degradado del acento y barra con pestañas.
  const glass = ctx.createLinearGradient(0, 0, 0, H);
  glass.addColorStop(0, light ? 'rgba(255,255,255,0.96)' : 'rgba(20,24,22,0.95)');
  glass.addColorStop(1, light ? 'rgba(245,245,242,0.96)' : 'rgba(10,12,11,0.96)');
  ctx.fillStyle = glass; ctx.beginPath(); ctx.roundRect(3, 3, W - 6, H - 6, 28); ctx.fill();
  const rim = ctx.createLinearGradient(0, 0, W, H);
  rim.addColorStop(0, colors.accent); rim.addColorStop(0.45, 'rgba(127,238,100,0.08)'); rim.addColorStop(1, colors.accent);
  ctx.strokeStyle = rim; ctx.lineWidth = 2.5; ctx.stroke();
  [bad, warn, ok].forEach((dot, i) => { ctx.fillStyle = dot; ctx.beginPath(); ctx.arc(36 + i * 24, 34, 8, 0, Math.PI * 2); ctx.fill(); });
  const tabs = ['main.tf', live.cd ? `deploy #${live.cd.run}` : 'deploy', 'live'];
  ctx.font = '500 21px "JetBrains Mono", ui-monospace, monospace'; ctx.textBaseline = 'middle';
  let tx = 124;
  tabs.forEach((label, i) => {
    const w = ctx.measureText(label).width + 26;
    if (i === phase) {
      ctx.fillStyle = light ? 'rgba(44,107,26,0.1)' : 'rgba(143,240,111,0.1)'; ctx.strokeStyle = light ? 'rgba(44,107,26,0.4)' : 'rgba(143,240,111,0.4)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.roundRect(tx, 18, w, 32, 9); ctx.fill(); ctx.stroke();
    }
    ctx.fillStyle = i === phase ? ink : muted; ctx.fillText(label, tx + 13, 35); tx += w + 8;
  });
  const apiDot = live.api === 'up' ? ok : live.api === 'degraded' ? warn : live.api === 'down' ? bad : muted;
  ctx.fillStyle = apiDot; ctx.beginPath(); ctx.arc(W - 196, 34, 6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = muted; ctx.fillText(live.api === 'demo' ? 'demo' : 'portfolio-prod', W - 182, 35);
  ctx.strokeStyle = line; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(3, 66); ctx.lineTo(W - 3, 66); ctx.moveTo(3, H - 52); ctx.lineTo(W - 3, H - 52); ctx.stroke();

  // Barra de estado: siempre datos reales.
  const events = live.events.filter((event) => now - event.at < 60_000).length;
  const status = [
    `⎇ main`, live.sha ? short(live.sha)! : null,
    live.api === 'demo' ? 'modo demo · sin backend' : live.latencyMs !== null ? `API ${live.latencyMs} ms` : null,
    live.api === 'demo' ? null : `${events} eventos/min`,
  ].filter(Boolean).join('   ·   ');
  ctx.fillStyle = muted; ctx.font = '500 19px "JetBrains Mono", ui-monospace, monospace'; ctx.fillText(status, 28, H - 26);

  ctx.save(); ctx.beginPath(); ctx.rect(3, 68, W - 6, H - 122); ctx.clip();
  if (phase === 0) paintCode(ctx, t, syntax, colors, live);
  else if (phase === 1) paintDeploy(ctx, W, t, ink, muted, ok, bad, live);
  else paintMap(ctx, W, H, t, now, colors, live, { ok, warn, bad, muted, ink, line });
  ctx.restore();
}

function paintCode(ctx: CanvasRenderingContext2D, t: number, s: Record<string, string>, colors: ScenePalette, live: IacLive): void {
  const image = live.sha ? `"sha-${short(live.sha)}"` : 'var.image';
  const code: [string, string][][] = [
    [['resource ', s['kw']], ['"cloudflare_pages_project" ', s['ty']], ['"site"', s['str']], [' {', s['pn']]],
    [['  production_branch = ', s['at']], ['"main"', s['str']]],
    [['}', s['pn']]],
    [['resource ', s['kw']], ['"google_cloud_run_v2_service" ', s['ty']], ['"api"', s['str']], [' {', s['pn']]],
    [['  location = ', s['at']], ['"us-east4"', s['str']]],
    [['  image    = ', s['at']], [image, live.sha ? s['str'] : s['ty']]],
    [['}', s['pn']]],
    [['resource ', s['kw']], ['"neon_project" ', s['ty']], ['"db"', s['str']], ['   # pgvector', s['cm']]],
    [['resource ', s['kw']], ['"upstash_redis_database" ', s['ty']], ['"cache"', s['str']]],
    [['resource ', s['kw']], ['"google_secret_manager_secret" ', s['ty']], ['"gemini"', s['str']]],
  ];
  ctx.font = '400 24px "JetBrains Mono", ui-monospace, monospace'; ctx.textBaseline = 'top';
  const total = code.reduce((n, row) => n + row.reduce((m, [text]) => m + text.length, 0), 0);
  let budget = Math.floor(total * ease(t / 5));
  let cursor: [number, number] | null = null;
  code.forEach((row, i) => {
    const y = 88 + i * 42;
    ctx.fillStyle = s['cm']; ctx.fillText(String(i + 1).padStart(2), 26, y);
    let x = 78; const before = budget;
    for (const [text, color] of row) {
      if (budget <= 0) break;
      const part = text.slice(0, budget); budget -= part.length;
      ctx.fillStyle = color; ctx.fillText(part, x, y); x += ctx.measureText(part).width;
    }
    if (!cursor && before > 0 && (budget <= 0 || i === code.length - 1)) cursor = [x, y];
  });
  // TypeScript no sigue la asignación dentro del forEach: se relee con su tipo.
  const at = cursor as [number, number] | null;
  if (at && Math.floor(t * 2.2) % 2 === 0) { ctx.fillStyle = colors.accent; ctx.fillRect(at[0] + 2, at[1] + 1, 13, 27); }
}

function paintDeploy(ctx: CanvasRenderingContext2D, W: number, t: number, ink: string, muted: string, ok: string, bad: string, live: IacLive): void {
  ctx.textBaseline = 'top'; ctx.font = '500 24px "JetBrains Mono", ui-monospace, monospace';
  ctx.fillStyle = ink;
  ctx.fillText(live.cd ? `$ gh run view ${live.cd.run} --workflow cd.yml` : '$ gh run view --workflow cd.yml', 28, 90);
  const jobs = (live.cd?.jobs ?? []).filter((job) => job.ok !== null);
  if (!jobs.length) {
    ctx.fillStyle = muted; ctx.fillText('Sin datos del último despliegue (modo demo o sin red).', 28, 150);
    return;
  }
  jobs.forEach((job, i) => {
    const start = 0.3 + i * 0.45; if (t < start) return;
    const done = t > start + 0.35, y = 148 + i * 46;
    ctx.globalAlpha = ease((t - start) / 0.25);
    ctx.fillStyle = done ? (job.ok ? ok : bad) : muted; ctx.fillText(done ? (job.ok ? '✓' : '✗') : '◌', 28, y);
    ctx.fillStyle = ink; ctx.fillText(JOB_LABEL[job.id] ?? job.id, 66, y);
    if (done && job.seconds !== null) { const label = `${job.seconds}s`; ctx.fillStyle = muted; ctx.fillText(label, W - 40 - ctx.measureText(label).width, y); }
    ctx.globalAlpha = 1;
  });
  const end = 0.3 + jobs.length * 0.45 + 0.4;
  if (t > end && live.cd) {
    ctx.globalAlpha = ease((t - end) / 0.4); ctx.font = '600 24px "JetBrains Mono", ui-monospace, monospace';
    const allOk = jobs.every((job) => job.ok);
    ctx.fillStyle = allOk ? ok : bad;
    ctx.fillText(allOk ? `Desplegado ${live.siteVersion ?? ''} en ${live.cd.seconds ?? '—'} s · sin reconstruir` : 'El despliegue falló: se volvió a la versión anterior', 28, 160 + jobs.length * 46);
    ctx.globalAlpha = 1;
  }
}

function paintMap(ctx: CanvasRenderingContext2D, W: number, H: number, t: number, now: number, colors: ScenePalette, live: IacLive,
  c: { ok: string; warn: string; bad: string; muted: string; ink: string; line: string }): void {
  const light = colors.light, muted = c.muted;
  const pad = 26, top = 104, nw = 210, nh = 70;
  const gw = W - pad * 2, gh = H - 52 - top - 24;
  const pos = new Map(NODES.map((n) => [n.id, { x: pad + nw / 2 + (gw - nw) * (n.c / 3), y: top + nh / 2 + (gh - nh) * (n.r / 2.5) }]));
  // Zonas.
  ctx.font = '500 17px Inter, system-ui, sans-serif'; ctx.textBaseline = 'middle';
  ([['Edge', ['cf']], ['Google Cloud · us-east4', ['run', 'sb']], ['Datos e IA', ['pg', 'rd', 'gm']]] as [string, NodeId[]][]).forEach(([label, ids], i) => {
    const a = ease((t - i * 0.15) / 0.5); if (!a) return;
    const ps = ids.map((id) => pos.get(id)!);
    const x0 = Math.min(...ps.map((p) => p.x)) - nw / 2 - 10, x1 = Math.max(...ps.map((p) => p.x)) + nw / 2 + 10;
    const y0 = Math.min(...ps.map((p) => p.y)) - nh / 2 - 30, y1 = Math.max(...ps.map((p) => p.y)) + nh / 2 + 10;
    ctx.globalAlpha = a; ctx.strokeStyle = light ? 'rgba(44,107,26,0.3)' : 'rgba(143,240,111,0.22)'; ctx.setLineDash([6, 7]); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(x0, y0, x1 - x0, y1 - y0, 16); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = c.muted; ctx.fillText(label, x0 + 14, y0 + 15); ctx.globalAlpha = 1;
  });
  // Conexiones curvas y, encima, los paquetes de los eventos reales.
  const curve = (a: NodeId, b: NodeId) => {
    const A = pos.get(a)!, B = pos.get(b)!;
    const vertical = Math.abs(A.x - B.x) < 2;
    const p0 = vertical ? [A.x, A.y + Math.sign(B.y - A.y) * nh / 2] : [A.x + nw / 2, A.y];
    const p3 = vertical ? [B.x, B.y - Math.sign(B.y - A.y) * nh / 2] : [B.x - nw / 2, B.y];
    const m = (p3[0] - p0[0]) / 2;
    const p1 = vertical ? p0 : [p0[0] + m, p0[1]], p2 = vertical ? p3 : [p3[0] - m, p3[1]];
    return (u: number): [number, number] => {
      const v = 1 - u;
      return [v * v * v * p0[0] + 3 * v * v * u * p1[0] + 3 * v * u * u * p2[0] + u * u * u * p3[0], v * v * v * p0[1] + 3 * v * v * u * p1[1] + 3 * v * u * u * p2[1] + u * u * u * p3[1]];
    };
  };
  LINKS.forEach(([a, b, deploy], i) => {
    const k = ease((t - 0.5 - i * 0.1) / 0.6); if (!k) return;
    const at = curve(a, b);
    // Las de despliegue (CI/CD), punteadas y tenues; las del tráfico, en el acento.
    ctx.strokeStyle = deploy ? muted : colors.accentText; ctx.globalAlpha = deploy ? 0.7 : 0.6;
    ctx.lineWidth = 2; if (deploy) ctx.setLineDash([8, 8]);
    ctx.beginPath(); ctx.moveTo(...at(0)); for (let u = 0.02; u <= k + 0.001; u += 0.02) ctx.lineTo(...at(Math.min(u, k))); ctx.stroke(); ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  });
  const glow = (x: number, y: number, color: string, r: number) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  };
  // Cada evento real recorre su conexión en 1,2 s.
  for (const event of live.events) {
    const u = (now - event.at) / 1200; if (u < 0 || u > 1) continue;
    const [a, b] = EVENT_LINK[event.target];
    const [x, y] = curve(a, b)(u); glow(x, y, colors.accent, 14);
  }
  // Nodos con su logo oficial, su dato vivo y su estado.
  NODES.forEach((n, i) => {
    const a = ease((t - 0.2 - i * 0.08) / 0.45); if (!a) return;
    const p = pos.get(n.id)!, x = p.x - nw / 2, y = p.y - nh / 2;
    const health = nodeHealth(n.id, live);
    ctx.globalAlpha = a;
    ctx.fillStyle = light ? 'rgba(255,255,255,0.98)' : 'rgba(21,24,22,0.98)';
    ctx.strokeStyle = n.id === 'sb' ? colors.accent : c.line; ctx.lineWidth = n.id === 'sb' ? 2 : 1.5;
    ctx.beginPath(); ctx.roundRect(x, y, nw, nh, 14); ctx.fill(); ctx.stroke();
    ctx.save(); ctx.translate(x + 14, p.y - 15); ctx.scale(30 / 24, 30 / 24);
    ctx.fillStyle = brandColor(n.id, colors); ctx.fill(icon(n.id)); ctx.restore();
    ctx.textBaseline = 'middle';
    ctx.fillStyle = c.ink; ctx.font = '600 21px Inter, system-ui, sans-serif'; ctx.fillText(n.title, x + 56, p.y - 12, nw - 76);
    ctx.fillStyle = c.muted; ctx.font = '500 17px "JetBrains Mono", ui-monospace, monospace'; ctx.fillText(nodeDetail(n.id, live), x + 56, p.y + 14, nw - 70);
    const dot = health === true ? c.ok : health === false ? c.bad : c.muted;
    if (health === true) glow(x + nw - 15, y + 15, dot, 10);
    ctx.fillStyle = dot; ctx.beginPath(); ctx.arc(x + nw - 15, y + 15, 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  });
  // Un evento que acaba de llegar enciende un momento su pieza de destino.
  for (const event of live.events) {
    const since = now - event.at - 1200; if (since < 0 || since > 500) continue;
    const p = pos.get(EVENT_LINK[event.target][1])!;
    ctx.globalAlpha = 1 - since / 500; ctx.strokeStyle = colors.accent; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.roundRect(p.x - nw / 2 - 3, p.y - nh / 2 - 3, nw + 6, nh + 6, 16); ctx.stroke(); ctx.globalAlpha = 1;
  }
}
