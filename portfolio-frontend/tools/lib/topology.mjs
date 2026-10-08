// Valida deploy/topology.json: la fuente de la vista «Arquitectura en producción».

const STATUSES = ['live', 'planned'];

/** @returns {{ nodes: object[], links: object[] }} la topología, sin campos de comentario */
export function readTopology(value) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.nodes) || !Array.isArray(value.links)) {
    throw new Error('topology.json necesita "nodes" y "links".');
  }
  const ids = new Set();
  const nodes = value.nodes.map((node) => {
    for (const field of ['id', 'label', 'role', 'what', 'why']) {
      if (typeof node[field] !== 'string' || node[field].trim() === '') {
        throw new Error(`Al nodo "${node.id ?? '?'}" le falta "${field}".`);
      }
    }
    if (ids.has(node.id)) {
      throw new Error(`El nodo "${node.id}" está repetido.`);
    }
    if (!STATUSES.includes(node.status)) {
      throw new Error(`El nodo "${node.id}" tiene estado "${node.status}": debe ser live o planned.`);
    }
    if (!Number.isInteger(node.stage) || node.stage < 0) {
      throw new Error(`El nodo "${node.id}" necesita una etapa (entero ≥ 0).`);
    }
    ids.add(node.id);
    return {
      id: node.id, label: node.label, role: node.role, icon: node.icon ?? null, stage: node.stage, status: node.status,
      what: node.what, why: node.why, facts: node.facts ?? null, health: node.health ?? null,
    };
  });
  const links = value.links.map((link) => {
    if (!ids.has(link.from) || !ids.has(link.to)) {
      throw new Error(`La conexión ${link.from} → ${link.to} apunta a un nodo que no existe.`);
    }
    return { from: link.from, to: link.to, label: typeof link.label === 'string' ? link.label : '' };
  });
  // Nombre de cada columna del diagrama; tiene que haber uno por etapa usada.
  const stages = Array.isArray(value.stages) ? value.stages.map(String) : [];
  const last = Math.max(...nodes.map((node) => node.stage));
  if (stages.length <= last) {
    throw new Error(`Faltan nombres de etapa: hay nodos en la etapa ${last} y solo ${stages.length} nombres en "stages".`);
  }
  return { stages, nodes, links };
}
