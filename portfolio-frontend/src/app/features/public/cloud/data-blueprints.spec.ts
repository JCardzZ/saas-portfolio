import { autoLayout } from './auto-layout';
import { CLOUD_PROVIDERS, forProvider } from './cloud-topology.data';
import { BLUEPRINT_IDS, DATA_BLUEPRINTS, mergeBlueprint } from './data-blueprints';
import { checkGraph, endpointOf } from './graph-rules';
import { MAX_NODES, parseProject, referenceProject, serializeProject, STUDIO_PRESETS } from './studio-project';
import { generateMainTf } from './terraform-generator';
import { validateTopology } from './topology-validator';

const blueprint = (id: string) => DATA_BLUEPRINTS.find((candidate) => candidate.id === id)!;

describe('data blueprints', () => {
  it('are three versioned templates, each with its problem and its trade-off', () => {
    expect(BLUEPRINT_IDS).toEqual(['cdc-realtime', 'event-analytics', 'multi-region-recovery']);
    for (const entry of DATA_BLUEPRINTS) {
      expect(entry.version).withContext(entry.id).toBeGreaterThanOrEqual(1);
      expect(entry.problem.length).withContext(entry.id).toBeGreaterThan(40);
      expect(entry.tradeoff).withContext(entry.id).toContain('a cambio de');
      expect(entry.tradeoff).withContext(entry.id).not.toContain('\n');
      expect(entry.description).withContext(entry.id).toContain('Patrón de referencia');
    }
    expect(STUDIO_PRESETS.some((preset) => BLUEPRINT_IDS.includes(preset.id))).toBeFalse();
  });

  it('draw the flow they are named after, with typed links', () => {
    const flow = (id: string) => blueprint(id).build().links.filter((link) => link.kind).map((link) => `${link.from}-${link.kind}->${link.to}`);
    expect(flow('cdc-realtime')).toEqual(['postgres-CDC_STREAM->cdc', 'cdc-CDC_STREAM->warehouse']);
    expect(flow('event-analytics')).toEqual([
      'api-EVENT_BUS->events', 'payments-EVENT_BUS->events', 'events-EVENT_BUS->processing',
      'processing-ANALYTICS_SINK->warehouse', 'warehouse-ANALYTICS_SINK->dashboards',
    ]);
    expect(flow('multi-region-recovery')).toEqual(['primary-REPLICATION->replica']);
    const roles = (id: string) => blueprint(id).build().nodes.map((node) => endpointOf(node.type)).filter((role) => role !== 'service');
    expect(roles('cdc-realtime')).toEqual(['database', 'cdc', 'data-warehouse']);
    expect(roles('event-analytics')).toEqual(['database', 'event-stream', 'stream-processing', 'data-warehouse', 'bi']);
    expect(roles('multi-region-recovery')).toEqual(['global-database', 'global-database']);
  });

  it('work in the three clouds: no rule or security warning, and Terraform for every piece', () => {
    for (const entry of DATA_BLUEPRINTS) {
      const { nodes, links } = entry.build();
      expect(checkGraph(nodes, links)).withContext(entry.id).toEqual([]);
      for (const provider of CLOUD_PROVIDERS) {
        const warnings = validateTopology(nodes, links, provider.id).filter((finding) => finding.level === 'warn');
        expect(warnings).withContext(`${entry.id} · ${provider.id}`).toEqual([]);
        expect(generateMainTf(nodes, links, provider.id)).withContext(`${entry.id} · ${provider.id}`).not.toContain('sin soporte');
        for (const node of nodes) {
          expect(forProvider(node.service, provider.id).length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('are stored already arranged and survive saving and reopening', () => {
    for (const entry of DATA_BLUEPRINTS) {
      const project = entry.build();
      const positions = (nodes: { id: string; x: number; y: number }[]) => nodes.map((node) => [node.id, node.x, node.y]);
      expect(positions(autoLayout(project.nodes, project.links, project.zones))).withContext(entry.id).toEqual(positions(project.nodes));
      expect(parseProject(serializeProject(project))).withContext(entry.id).toEqual({ ok: true, project });
      expect(new Set(positions(project.nodes).map(([, x, y]) => `${x},${y}`)).size).withContext(entry.id).toBe(project.nodes.length);
    }
  });
});

describe('mergeBlueprint', () => {
  it('hooks the blueprint onto the pieces the canvas already has instead of duplicating them', () => {
    const current = { ...referenceProject(), provider: 'gcp' as const };
    const merged = mergeBlueprint(current, blueprint('cdc-realtime').build());
    expect(merged.ok).toBeTrue();
    if (!merged.ok) {
      return;
    }
    expect(merged.added).toBe(2);
    expect(merged.project.provider).toBe('gcp');
    expect(merged.project.nodes.map((node) => node.id)).toEqual([...current.nodes.map((node) => node.id), 'cdc', 'warehouse']);
    expect(merged.project.links.filter((link) => link.kind)).toEqual([
      { from: 'postgres', to: 'cdc', kind: 'CDC_STREAM' }, { from: 'cdc', to: 'warehouse', kind: 'CDC_STREAM' },
    ]);
    // Lo que ya estaba conectado no se repite.
    expect(merged.project.links.filter((link) => link.from === 'api' && link.to === 'postgres').length).toBe(1);
    expect(checkGraph(merged.project.nodes, merged.project.links)).toEqual([]);
  });

  it('gives a free id to a piece whose id is taken by something else', () => {
    const current = referenceProject();
    current.nodes.push({ ...current.nodes[0], id: 'cdc', type: 'functions' });
    const merged = mergeBlueprint(current, blueprint('cdc-realtime').build());
    expect(merged.ok && merged.project.nodes.map((node) => node.id).slice(-2)).toEqual(['cdc-2', 'warehouse']);
    expect(merged.ok && merged.project.links.filter((link) => link.kind).map((link) => `${link.from}>${link.to}`)).toEqual(['postgres>cdc-2', 'cdc-2>warehouse']);
  });

  it('brings the zones the canvas lacks and leaves no two nodes on the same spot', () => {
    const merged = mergeBlueprint(referenceProject(), blueprint('multi-region-recovery').build());
    expect(merged.ok && merged.project.zones.some((zone) => zone.id === 'second-region')).toBeTrue();
    const spots = merged.ok ? merged.project.nodes.map((node) => `${node.x},${node.y}`) : [];
    expect(new Set(spots).size).toBe(spots.length);
  });

  it('does not touch the canvas it was given and refuses what does not fit', () => {
    const current = referenceProject();
    const before = structuredClone(current);
    mergeBlueprint(current, blueprint('event-analytics').build());
    expect(current).toEqual(before);

    const full = referenceProject();
    while (full.nodes.length < MAX_NODES - 1) {
      full.nodes.push({ ...full.nodes[0], id: `relleno-${full.nodes.length}` });
    }
    expect(mergeBlueprint(full, blueprint('cdc-realtime').build())).toEqual({ ok: false, error: 'El lienzo admite 60 nodos como máximo: no cabe el patrón entero.' });
  });
});
