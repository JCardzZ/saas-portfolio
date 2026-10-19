import { SERVICE_CATALOG } from '../../features/public/cloud/cloud-catalog.data';
import { CLOUD_NODES, CLOUD_PROVIDERS } from '../../features/public/cloud/cloud-topology.data';
import { DATA_BLUEPRINTS } from '../../features/public/cloud/data-blueprints';
import { BASE_ZONES, STUDIO_PRESETS, zoneLabel } from '../../features/public/cloud/studio-project';
import { EN } from './en';

/**
 * Lo que el Estudio pinta en pantalla sale de sus datos y pasa por el pipe `t`. Si una pieza,
 * plantilla o patrón nuevo no tiene su texto en `en.ts`, la versión inglesa enseñaría español:
 * este test lo detecta al añadirla.
 */
describe('English translations of the Studio', () => {
  const missing = (texts: Iterable<string>) => [...new Set(texts)].filter((text) => text.trim() && !(text in EN));

  it('covers every catalogue category, service explanation and node of the canvas', () => {
    expect(missing(SERVICE_CATALOG.map((category) => category.name))).toEqual([]);
    expect(missing(SERVICE_CATALOG.flatMap((category) => category.items.map((item) => item.why)))).toEqual([]);
    expect(missing(CLOUD_NODES.flatMap((node) => [node.role, node.why]))).toEqual([]);
  });

  it('covers every template, data pattern and the nodes they draw', () => {
    expect(missing(STUDIO_PRESETS.flatMap((preset) => [preset.name, preset.summary]))).toEqual([]);
    expect(missing(STUDIO_PRESETS.flatMap((preset) => preset.build().nodes.map((node) => node.role)))).toEqual([]);
    expect(missing(DATA_BLUEPRINTS.flatMap((blueprint) => [blueprint.name, blueprint.summary, blueprint.problem, blueprint.tradeoff]))).toEqual([]);
  });

  it('covers the default name of every zone on every cloud', () => {
    const labels = CLOUD_PROVIDERS.flatMap((provider) => BASE_ZONES.map((zone) => zoneLabel(zone, provider.id)));
    expect(missing(labels)).toEqual([]);
  });
});
