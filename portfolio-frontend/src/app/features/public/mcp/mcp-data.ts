/**
 * Datos de la sección «Usa mi plataforma desde tu IA» que no vienen de la API: la grabación de
 * una sesión MCP real y el resultado de las evaluaciones. Los dos son archivos estáticos
 * (`public/mcp/`) que escriben los tests del backend, no se editan a mano:
 * - `session.json`: `McpSessionRecordingTest` (`MCP_SESSION_UPDATE=true`);
 * - `mcp-eval.json`: `McpEvalTest` (`MCP_EVAL_UPDATE=true`).
 */
export const SESSION_URL = 'mcp/session.json';
export const EVAL_URL = 'mcp/mcp-eval.json';

/** Un mensaje JSON-RPC de la grabación, en un sentido. */
export interface SessionStep {
  direction: 'request' | 'response';
  /** Qué se estaba haciendo: «Conectar», «Validar una arquitectura»… */
  label: string;
  /** Lo que tardó el servidor en responder, en ms (solo en las respuestas). */
  ms?: number;
  message: Record<string, unknown>;
}

export interface SessionRecording {
  protocolVersion: string;
  note: string;
  steps: SessionStep[];
}

export interface EvalReport {
  generatedAt: string;
  model: string;
  simulated: boolean;
  total: number;
  passed: number;
  toolCalls: number;
  tasks: { id: string; area: string; passed: boolean; calls: number; latencyMs: number; failures: string[] }[];
}

/** Una herramienta tal como la enseña la sección: venga del estado del servidor o de la grabación. */
export interface ToolCard {
  name: string;
  title: string;
  description: string;
  kind: 'read' | 'generate';
  version: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Lo que llega de un archivo se comprueba antes de pintarlo, como cualquier otra cosa de la red. */
export function parseRecording(value: unknown): SessionRecording | null {
  if (!isRecord(value) || !Array.isArray(value['steps'])) {
    return null;
  }
  const steps = value['steps'].flatMap((step): SessionStep[] =>
    isRecord(step) && (step['direction'] === 'request' || step['direction'] === 'response') && typeof step['label'] === 'string' && isRecord(step['message'])
      ? [{
          direction: step['direction'], label: step['label'], message: step['message'],
          ...(typeof step['ms'] === 'number' ? { ms: step['ms'] } : {}),
        }]
      : []);
  return steps.length
    ? { protocolVersion: String(value['protocolVersion'] ?? ''), note: String(value['note'] ?? ''), steps }
    : null;
}

export function parseEval(value: unknown): EvalReport | null {
  if (!isRecord(value) || typeof value['total'] !== 'number' || typeof value['passed'] !== 'number' || !Array.isArray(value['tasks'])) {
    return null;
  }
  return value as unknown as EvalReport;
}

/** Las herramientas que el servidor anunció en la grabación (la respuesta a `tools/list`). */
export function toolsOf(recording: SessionRecording): ToolCard[] {
  const listed = recording.steps.find((step) => step.direction === 'response' && isRecord(step.message['result'])
    && Array.isArray((step.message['result'] as Record<string, unknown>)['tools']));
  const tools = listed ? ((listed.message['result'] as Record<string, unknown>)['tools'] as unknown[]) : [];
  return tools.flatMap((tool): ToolCard[] => {
    if (!isRecord(tool) || typeof tool['name'] !== 'string') {
      return [];
    }
    const meta = isRecord(tool['_meta']) ? tool['_meta'] : {};
    return [{
      name: tool['name'], title: String(tool['title'] ?? tool['name']), description: String(tool['description'] ?? ''),
      kind: meta['kind'] === 'generate' ? 'generate' : 'read', version: String(meta['version'] ?? ''),
    }];
  });
}

/** Una llamada a una herramienta, anónima: qué herramienta, cómo acabó y cuánto tardó. */
export interface ToolActivity {
  tool: string;
  outcome: string;
  latencyMs: number;
  /** Hora local a la que llegó, o `null` en una grabación. */
  time: string | null;
}

/** Las llamadas a herramientas de la grabación, como actividad. */
export function activityOf(recording: SessionRecording): ToolActivity[] {
  const activity: ToolActivity[] = [];
  recording.steps.forEach((step, index) => {
    const params = step.message['params'];
    if (step.direction !== 'request' || step.message['method'] !== 'tools/call' || !isRecord(params)) {
      return;
    }
    const answer = recording.steps.slice(index + 1).find((candidate) => candidate.direction === 'response' && candidate.message['id'] === step.message['id']);
    const result = answer && isRecord(answer.message['result']) ? answer.message['result'] : {};
    activity.push({ tool: String(params['name']), outcome: result['isError'] === true ? 'error' : 'ok', latencyMs: answer?.ms ?? 0, time: null });
  });
  return activity;
}

/** `tool=x outcome=ok latencyMs=12`, el detalle del evento de telemetría `MCP_TOOL_CALL`. */
export function parseActivity(detail: string, time: string): ToolActivity | null {
  const match = /^tool=([a-z_]+) outcome=([a-z_]+) latencyMs=(\d+)$/.exec(detail.trim());
  return match ? { tool: match[1], outcome: match[2], latencyMs: Number(match[3]), time } : null;
}

// ---------- Cómo conectarse desde cada cliente ----------

export interface ClientGuide {
  id: 'claude-code' | 'claude-desktop' | 'cursor' | 'vscode';
  /** Nombre del cliente, en texto: no se usa su logo (docs/brand-usage.md). */
  name: string;
  /** Qué hay que hacer, en una frase. */
  how: string;
  /** Texto para copiar: una orden, una dirección o un fragmento de configuración. */
  copy: string;
  copyLabel: string;
  /** Enlace que instala el servidor en el cliente, donde el cliente lo documenta. */
  link?: { href: string; label: string };
}

/**
 * La forma de conectarse que documenta cada cliente (comprobado en su documentación oficial el
 * 2026-10-11 y el 2026-10-12). Solo Cursor documenta un enlace de instalación; en los demás se
 * copia la orden o la configuración.
 */
export function clientGuides(url: string): ClientGuide[] {
  const cursorConfig = btoa(JSON.stringify({ url }));
  return [
    {
      id: 'claude-code', name: 'Claude Code', how: 'Ejecuta esta orden en la terminal.',
      copy: `claude mcp add --transport http portfolio ${url}`, copyLabel: 'Copiar la orden',
    },
    {
      id: 'claude-desktop', name: 'Claude Desktop',
      how: 'En Personalizar → Conectores → Añadir conector personalizado, pega esta dirección. No pide inicio de sesión.',
      copy: url, copyLabel: 'Copiar la dirección',
    },
    {
      id: 'cursor', name: 'Cursor', how: 'Ábrelo con el enlace, o añade esto a tu mcp.json.',
      copy: JSON.stringify({ mcpServers: { portfolio: { url } } }, null, 2), copyLabel: 'Copiar la configuración',
      link: { href: `cursor://anysphere.cursor-deeplink/mcp/install?name=portfolio&config=${encodeURIComponent(cursorConfig)}`, label: 'Añadir a Cursor' },
    },
    {
      id: 'vscode', name: 'VS Code', how: 'Añade esto a tu mcp.json (el del espacio de trabajo o el de usuario).',
      copy: JSON.stringify({ servers: { portfolio: { type: 'http', url } } }, null, 2), copyLabel: 'Copiar la configuración',
    },
  ];
}
