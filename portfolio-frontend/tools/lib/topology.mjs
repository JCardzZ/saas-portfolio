// Valida deploy/topology.json: la fuente de la vista «Arquitectura en producción».

const STATUSES = ['live', 'planned'];
const FLOWS = ['request', 'delivery'];
const EN_FIELDS = ['label', 'role', 'what', 'why'];

/** @returns {{ stages: string[], zones: object[], nodes: object[], links: object[] }} la topología, sin campos de comentario */
export function readTopology(value) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.nodes) || !Array.isArray(value.links)) {
    throw new Error('topology.json necesita "nodes" y "links".');
  }
  // Recuadros del lienzo (GitHub, Cloudflare, Google Cloud…): cada uno abarca a sus piezas.
  const zones = (Array.isArray(value.zones) ? value.zones : []).map((zone) => {
    if (typeof zone.id !== 'string' || typeof zone.label !== 'string' || zone.label.trim() === '') {
      throw new Error('Cada zona necesita "id" y "label".');
    }
    return { id: zone.id, label: zone.label, labelEn: typeof zone.labelEn === 'string' ? zone.labelEn : zone.label, icon: zone.icon ?? null };
  });
  const zoneIds = new Set(zones.map((zone) => zone.id));
  const cells = new Set();
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
    if (node.zone != null && !zoneIds.has(node.zone)) {
      throw new Error(`El nodo "${node.id}" está en la zona "${node.zone}", que no existe.`);
    }
    if (!Number.isInteger(node.col) || node.col < 0 || !Number.isInteger(node.row) || node.row < 0) {
      throw new Error(`El nodo "${node.id}" necesita "col" y "row" (enteros ≥ 0): su sitio en el lienzo.`);
    }
    const cell = `${node.col},${node.row}`;
    if (cells.has(cell)) {
      throw new Error(`Dos nodos en la misma celda (${cell}): el lienzo los solaparía.`);
    }
    cells.add(cell);
    const en = {};
    for (const field of EN_FIELDS) {
      const text = node.en?.[field];
      en[field] = typeof text === 'string' && text.trim() !== '' ? text : field === 'label' ? node.label : null;
      if (en[field] === null) {
        throw new Error(`Al nodo "${node.id}" le falta su texto en inglés "en.${field}".`);
      }
    }
    ids.add(node.id);
    return {
      id: node.id, label: node.label, role: node.role, icon: node.icon ?? null, stage: node.stage, status: node.status,
      what: node.what, why: node.why, facts: node.facts ?? null, health: node.health ?? null,
      zone: node.zone ?? null, col: node.col, row: node.row, en,
    };
  });
  const links = value.links.map((link) => {
    if (!ids.has(link.from) || !ids.has(link.to)) {
      throw new Error(`La conexión ${link.from} → ${link.to} apunta a un nodo que no existe.`);
    }
    if (!FLOWS.includes(link.flow)) {
      throw new Error(`La conexión ${link.from} → ${link.to} necesita "flow": request o delivery.`);
    }
    const label = typeof link.label === 'string' ? link.label : '';
    return { from: link.from, to: link.to, label, labelEn: typeof link.labelEn === 'string' ? link.labelEn : label, flow: link.flow };
  });
  // Nombre de cada columna del diagrama; tiene que haber uno por etapa usada.
  const stages = Array.isArray(value.stages) ? value.stages.map(String) : [];
  const last = Math.max(...nodes.map((node) => node.stage));
  if (stages.length <= last) {
    throw new Error(`Faltan nombres de etapa: hay nodos en la etapa ${last} y solo ${stages.length} nombres en "stages".`);
  }
  return { stages, zones, nodes, links };
}
