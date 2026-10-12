import {
  COMPLIANCE_OPTIONS, Compliance, NFR_INPUTS, NFR_RULES, NfrField, NfrRule, SYSTEM_CATALOG, SystemCategory, SystemCategoryId, SystemOption,
} from './system-catalog.data';

/**
 * Un sistema completo: lo que se ha elegido en la vista de Aplicación, en qué pieza de la vista
 * de Infraestructura se despliega cada cosa y los requisitos no funcionales que se le piden.
 * Las dos vistas son el mismo proyecto: la infraestructura es el grafo del lienzo y esto, lo
 * que va encima.
 *
 * Las mismas comprobaciones las hace el backend (`SystemDesignRules`), con los mismos datos y
 * los mismos textos: los casos de `architecture/system-cases.json` lo verifican en los dos lados.
 */
export interface NonFunctional {
  users?: number;
  rps?: number;
  latencyMs?: number;
  availability?: number;
  budgetUsd?: number;
  compliance: Compliance[];
}

export interface SystemDesign {
  /** Opción elegida en cada categoría. Una categoría opcional sin elegir no está. */
  choices: Partial<Record<SystemCategoryId, string>>;
  /** «Se despliega en»: id del nodo de infraestructura de cada pieza. */
  deployments: Partial<Record<SystemCategoryId, string>>;
  nfr: NonFunctional;
}

/** Punto de partida: una web con API REST sobre PostgreSQL, sin requisitos todavía. */
export function defaultSystemDesign(): SystemDesign {
  return {
    choices: { client: 'web-spa', backend: 'spring-boot', api: 'rest', auth: 'jwt-own', database: 'postgresql' },
    deployments: {},
    nfr: { compliance: [] },
  };
}

export interface SystemData {
  catalog: SystemCategory[];
  rules: NfrRule[];
}

const DATA: SystemData = { catalog: SYSTEM_CATALOG, rules: NFR_RULES };

/** Nodo de la vista de Infraestructura, con lo justo para comprobar un despliegue. */
export interface InfraNode {
  id: string;
  type: string;
}

export interface SystemFinding {
  /** Regla que lo provoca (`rps-cache`, `deployment-invalid`…). */
  rule: string;
  kind: 'input' | 'deployment' | 'nfr';
  severity: 'error' | 'warning';
  /** Categoría de la vista de Aplicación a la que se refiere, si la hay. */
  category?: SystemCategoryId;
  /** Nodo de infraestructura al que se refiere, si lo hay. */
  nodeId?: string;
  message: string;
  suggestion?: string;
}

export function categoryOf(id: SystemCategoryId, data: SystemData = DATA): SystemCategory {
  return data.catalog.find((category) => category.id === id)!;
}

/** La opción elegida en una categoría, o `null` si no hay ninguna (o ya no existe). */
export function chosen(design: SystemDesign, id: SystemCategoryId, data: SystemData = DATA): SystemOption | null {
  return categoryOf(id, data).options.find((option) => option.id === design.choices[id]) ?? null;
}

/** Nodos de la infraestructura en los que se puede desplegar una opción. */
export function deployTargets<T extends InfraNode>(option: SystemOption, nodes: T[]): T[] {
  return nodes.filter((node) => option.deploysOn.includes(node.type));
}

/** Un número como se escribe en los mensajes: sin separadores, igual en el navegador y en el backend. */
export function plain(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(4)));
}

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => values[key] ?? whole);
}

/**
 * Comprueba el sistema: que lo pedido tenga sentido, que cada pieza se despliegue donde puede
 * y que el diseño cumpla lo que piden los requisitos no funcionales. Nunca impide editar ni
 * guardar: informa, con qué hacer.
 *
 * @param costUsd coste mensual estimado de la infraestructura, o `null` si no hay estimación
 */
export function evaluateSystem(
  design: SystemDesign, nodes: InfraNode[], costUsd: number | null, nameOf: (node: InfraNode) => string = (node) => node.id, data: SystemData = DATA,
): SystemFinding[] {
  const findings: SystemFinding[] = [];

  for (const input of NFR_INPUTS) {
    const value = design.nfr[input.field];
    if (value === undefined) {
      continue;
    }
    const allowed = input.choices ? input.choices.includes(value) : value >= input.min && value <= input.max;
    if (!allowed) {
      findings.push({
        rule: 'nfr-range', kind: 'input', severity: 'error',
        message: input.choices
          ? `${input.name}: elige uno de estos valores: ${input.choices.map(plain).join(', ')}.`
          : `${input.name}: tiene que estar entre ${plain(input.min)} y ${plain(input.max)}.`,
      });
    }
  }

  for (const category of data.catalog) {
    const option = chosen(design, category.id, data);
    if (!option) {
      if (!category.optional) {
        findings.push({
          rule: 'choice-missing', kind: 'input', severity: 'error', category: category.id,
          message: `${category.name}: falta elegir una opción.`, suggestion: category.question,
        });
      }
      continue;
    }
    if (option.deploysOn.length === 0) {
      continue;
    }
    const targets = deployTargets(option, nodes);
    const where = targets.length
      ? `Despliégalo en ${targets.map(nameOf).join(' o ')}.`
      : 'Añade a la infraestructura una pieza donde desplegarlo.';
    const nodeId = design.deployments[category.id];
    const node = nodes.find((candidate) => candidate.id === nodeId);
    if (nodeId === undefined) {
      findings.push({
        rule: 'deployment-pending', kind: 'deployment', severity: 'warning', category: category.id,
        message: `${option.name} todavía no se despliega en ninguna pieza de la infraestructura.`, suggestion: where,
      });
    } else if (!node) {
      findings.push({
        rule: 'deployment-missing', kind: 'deployment', severity: 'error', category: category.id,
        message: `${option.name} se desplegaba en una pieza que ya no está en la infraestructura.`, suggestion: where,
      });
    } else if (!option.deploysOn.includes(node.type)) {
      findings.push({
        rule: 'deployment-invalid', kind: 'deployment', severity: 'error', category: category.id, nodeId: node.id,
        message: `${option.name} no se puede desplegar en ${nameOf(node)}.`, suggestion: where,
      });
    }
  }

  for (const rule of data.rules) {
    const value = triggered(rule, design);
    if (value === null) {
      continue;
    }
    const expect = rule.expect;
    let met: boolean;
    const values: Record<string, string> = { value };
    if (expect.kind === 'choice-in') {
      met = expect.options.includes(design.choices[expect.category] ?? '');
    } else if (expect.kind === 'infra-any') {
      met = nodes.some((node) => expect.types.includes(node.type));
    } else if (expect.kind === 'infra-replicated') {
      const count = nodes.filter((node) => expect.types.includes(node.type)).length;
      met = count !== 1 || nodes.some((node) => expect.orAny.includes(node.type));
    } else {
      if (costUsd === null || design.nfr.budgetUsd === undefined) {
        continue;
      }
      met = costUsd <= design.nfr.budgetUsd;
      values['cost'] = plain(Math.round(costUsd));
      values['budget'] = plain(design.nfr.budgetUsd);
    }
    if (!met) {
      findings.push({
        rule: rule.id, kind: 'nfr', severity: 'warning', ...(expect.kind === 'choice-in' ? { category: expect.category } : {}),
        message: fill(rule.message, values), suggestion: rule.suggestion,
      });
    }
  }
  return findings;
}

/** El valor pedido que dispara la regla, como texto, o `null` si no se dispara. */
function triggered(rule: NfrRule, design: SystemDesign): string | null {
  if ('compliance' in rule.when) {
    return design.nfr.compliance.includes(rule.when.compliance) ? rule.when.compliance : null;
  }
  const value = design.nfr[rule.when.field];
  if (value === undefined) {
    return null;
  }
  return (rule.when.op === '>=' ? value >= rule.when.value : value <= rule.when.value) ? plain(value) : null;
}

// ---------- Lectura de un diseño guardado ----------

const NFR_FIELDS: NfrField[] = NFR_INPUTS.map((input) => input.field);
const NODE_ID = /^[A-Za-z0-9_-]{1,48}$/;

/**
 * Lee el diseño de sistema de un proyecto guardado o importado. Como el resto del proyecto, no
 * se confía en él: solo se aceptan categorías y opciones del catálogo, ids de nodo con forma de
 * id y números finitos. Lo que no encaja se descarta; si no hay nada que leer, `null`.
 */
export function parseSystemDesign(raw: unknown, data: SystemData = DATA): SystemDesign | null {
  if (!isRecord(raw)) {
    return null;
  }
  const design = defaultSystemDesign();
  const choices = isRecord(raw['choices']) ? raw['choices'] : {};
  const deployments = isRecord(raw['deployments']) ? raw['deployments'] : {};
  for (const category of data.catalog) {
    const option = category.options.find((candidate) => candidate.id === choices[category.id]);
    if (option) {
      design.choices[category.id] = option.id;
    } else if (category.optional) {
      delete design.choices[category.id];
    }
    const nodeId = deployments[category.id];
    if (typeof nodeId === 'string' && NODE_ID.test(nodeId) && chosen(design, category.id, data)?.deploysOn.length) {
      design.deployments[category.id] = nodeId;
    }
  }
  const nfr = isRecord(raw['nfr']) ? raw['nfr'] : {};
  for (const field of NFR_FIELDS) {
    const value = nfr[field];
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      design.nfr[field] = value;
    }
  }
  const compliance = Array.isArray(nfr['compliance']) ? nfr['compliance'] : [];
  design.nfr.compliance = COMPLIANCE_OPTIONS.map((option) => option.id).filter((id) => compliance.includes(id));
  return design;
}

/** Quita los despliegues que apuntan a una opción que ya no se despliega (tras cambiar de elección). */
export function withChoice(design: SystemDesign, category: SystemCategoryId, optionId: string | null, data: SystemData = DATA): SystemDesign {
  const choices = { ...design.choices };
  const deployments = { ...design.deployments };
  if (optionId === null) {
    delete choices[category];
  } else {
    choices[category] = optionId;
  }
  delete deployments[category];
  return { ...design, choices, deployments };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
