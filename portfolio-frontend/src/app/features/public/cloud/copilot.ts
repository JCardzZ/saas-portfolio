import { CatalogCategory, CatalogItem } from './cloud-catalog.data';
import { CostOverrides, NODE_COSTS, localUsd } from './cloud-costs.data';
import { CloudNode, CloudProviderId, forProvider } from './cloud-topology.data';

export const COPILOT_MAX_PROMPT = 1000;
const SNIPPET_LANGUAGES = ['java', 'terraform', 'solidity', 'yaml', 'sql', 'bash'];
const CUSTOM_NAME = /^[\p{L}\p{N}][\p{L}\p{N} .+#/_-]{0,39}$/u;

/** Pieza que una recomendación añadiría al lienzo. `code` es del catálogo, o `custom` con su `name`. */
export interface CopilotAddition {
  code: string;
  name?: string;
  role?: string;
  connectFrom?: string;
}

export interface CopilotRecommendation {
  title: string;
  pros: string[];
  cons: string[];
  snippetLanguage?: string;
  snippet?: string;
  additions: CopilotAddition[];
}

export interface CopilotAdvice {
  answer: string;
  recommendations: CopilotRecommendation[];
}

/**
 * Segunda criba de lo que responde el copiloto (la primera la hace el backend): lo redacta un
 * modelo, así que aquí solo pasa lo que tiene la forma esperada y, de las piezas propuestas, las
 * que están en el catálogo o son tecnologías ajenas con un nombre sencillo.
 */
export function cleanAdvice(raw: unknown, catalog: CatalogCategory[]): CopilotAdvice {
  const codes = new Set(catalog.flatMap((category) => category.items.map((item) => item.type)));
  const record = (value: unknown): Record<string, unknown> => (typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {});
  const text = (value: unknown, max: number) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '');
  const list = (value: unknown, max: number) => (Array.isArray(value) ? value.map((item) => text(item, 200)).filter(Boolean).slice(0, max) : []);
  const source = record(raw);

  const recommendations = (Array.isArray(source['recommendations']) ? source['recommendations'] : []).slice(0, 3).flatMap((entry): CopilotRecommendation[] => {
    const item = record(entry);
    const title = text(item['title'], 120);
    if (!title) {
      return [];
    }
    const language = text(item['snippetLanguage'], 20).toLowerCase();
    const snippet = typeof item['snippet'] === 'string' ? item['snippet'].trim().slice(0, 1500) : '';
    const additions = (Array.isArray(item['additions']) ? item['additions'] : []).slice(0, 6).flatMap((value): CopilotAddition[] => {
      const addition = record(value);
      const code = text(addition['code'], 48);
      const name = text(addition['name'], 40);
      const custom = code === 'custom' && CUSTOM_NAME.test(name);
      if (!custom && !codes.has(code)) {
        return [];
      }
      return [{
        code, ...(custom ? { name } : {}), ...(text(addition['role'], 60) ? { role: text(addition['role'], 60) } : {}),
        ...(text(addition['connectFrom'], 48) ? { connectFrom: text(addition['connectFrom'], 48) } : {}),
      }];
    });
    return [{
      title, pros: list(item['pros'], 4), cons: list(item['cons'], 4), additions,
      ...(SNIPPET_LANGUAGES.includes(language) && snippet ? { snippetLanguage: language, snippet } : {}),
    }];
  });
  return { answer: typeof source['answer'] === 'string' ? source['answer'].trim().slice(0, 2000) : '', recommendations };
}

/** Nombre con el que se muestra una pieza propuesta, en la nube activa. */
export function additionName(addition: CopilotAddition, catalog: CatalogCategory[], provider: CloudProviderId): string {
  const item = catalogItem(addition.code, catalog);
  return item ? forProvider(item.service, provider) : (addition.name ?? addition.code);
}

export function catalogItem(code: string, catalog: CatalogCategory[]): CatalogItem | undefined {
  return catalog.flatMap((category) => category.items).find((item) => item.type === code);
}

/**
 * Impacto en el coste mensual de aplicar una recomendación, con los mismos costes orientativos
 * que usa FinOps. No lo estima el modelo. Las tecnologías que no están en el catálogo no tienen
 * coste conocido y se cuentan aparte.
 */
export function additionsCost(
  additions: CopilotAddition[], catalog: CatalogCategory[], provider: CloudProviderId, overrides: CostOverrides = {},
): { usd: number; unknown: number } {
  let usd = 0;
  let unknown = 0;
  for (const addition of additions) {
    if (!catalogItem(addition.code, catalog)) {
      unknown++;
      continue;
    }
    const local = NODE_COSTS[addition.code]?.usd ?? 0;
    usd += overrides[addition.code]?.[provider] ?? localUsd(local, provider);
  }
  return { usd, unknown };
}

/** Respuesta SIMULADA del copiloto para el modo demo: fija según palabras de la pregunta, sin modelo detrás. */
export function mockCopilotAdvice(prompt: string, nodes: Pick<CloudNode, 'id' | 'type'>[]): CopilotAdvice {
  const text = prompt.toLowerCase();
  const from = nodes.some((node) => node.id === 'api') ? { connectFrom: 'api' } : {};
  const has = (type: string) => nodes.some((node) => node.type === type);

  if (/web3|polygon|ipfs|blockchain|solidity/.test(text)) {
    return {
      answer: 'Una capa Web3 encaja como **servicios externos**: la API sigue siendo la única que habla con ellos.',
      recommendations: [{
        title: 'Capa L2 y almacenamiento descentralizado',
        pros: ['Comisiones bajas frente a la red principal', 'Contenido direccionado por su hash, inmutable'],
        cons: ['Dependes de nodos de terceros', 'La finalidad de una L2 no es inmediata', 'Lo publicado no se puede borrar'],
        snippetLanguage: 'solidity',
        snippet: 'contract DocumentRegistry {\n    mapping(bytes32 => string) public cidOf;\n\n    function register(bytes32 id, string calldata cid) external {\n        cidOf[id] = cid;\n    }\n}',
        additions: [
          { code: 'custom', name: 'Polygon L2', role: 'Contratos y transacciones', ...from },
          { code: 'custom', name: 'IPFS', role: 'Documentos por hash', ...from },
        ],
      }],
    };
  }
  if (/cost|barat|finops|presupuesto|ahorr/.test(text)) {
    return {
      answer: 'El coste fijo se concentra en el cómputo y la base de datos, que funcionan las 24 horas.',
      recommendations: [{
        title: 'Dimensiona la base de datos antes de añadir piezas',
        pros: ['No cambia la arquitectura', 'El compromiso de uso descuenta sobre lo que ya pagas'],
        cons: ['Un compromiso te ata uno o tres años', 'Una instancia más pequeña tiene menos margen ante picos'],
        snippetLanguage: 'terraform',
        snippet: 'variable "postgres_instance" {\n  type    = string\n  default = "db.t4g.medium"\n}',
        additions: [],
      }],
    };
  }
  if (/resilien|disponib|ca[ií]da|fall|toleran/.test(text)) {
    return {
      answer: 'Lo que más protege es **desacoplar** lo lento y no depender de una sola instancia de datos.',
      recommendations: [
        {
          title: 'Desacopla el trabajo lento con una cola',
          pros: ['Un pico o una caída del destino solo retrasa el trabajo', 'Los reintentos dejan de estar en la petición del usuario'],
          cons: ['Una pieza más que operar y vigilar', 'El resultado deja de ser inmediato'],
          snippetLanguage: 'java',
          snippet: '@CircuitBreaker(name = "aiEngine", fallbackMethod = "enqueue")\npublic Answer ask(Question question) {\n    return ai.generate(question);\n}',
          additions: [{ code: 'queue', role: 'Reintentos y trabajo diferido', ...from }],
        },
        ...(has('redis') ? [] : [{
          title: 'Pon una caché delante de la base de datos',
          pros: ['Las lecturas sobreviven a una caída breve de la base de datos'],
          cons: ['Datos con unos minutos de retraso'],
          additions: [{ code: 'redis', ...from }],
        }]),
      ],
    };
  }
  return {
    answer: 'Antes de cambiar la arquitectura conviene **ver** qué hace: sin trazas, cualquier mejora es a ciegas.',
    recommendations: [{
      title: 'Añade trazas distribuidas',
      pros: ['Ves dónde se va el tiempo de cada petición', 'Es un estándar: no te ata a un proveedor'],
      cons: ['Instrumentar lleva trabajo', 'Las trazas también cuestan almacenamiento'],
      snippetLanguage: 'yaml',
      snippet: 'management:\n  tracing:\n    sampling:\n      probability: 0.1',
      additions: [{ code: 'opentelemetry', ...from }],
    }],
  };
}
