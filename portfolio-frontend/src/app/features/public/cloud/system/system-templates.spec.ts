import { estimateCost } from '../cloud-costs.data';
import { advisories, checkGraph } from '../graph-rules';
import { MAX_NODES, parseProject, serializeProject } from '../studio-project';
import { directNodes, fits } from '../zone-layout';
import { chosen, evaluateSystem } from './system-design';
import { SYSTEM_CATALOG } from './system-catalog.data';
import { FICTIONAL_LABEL, SYSTEM_TEMPLATES, SYSTEM_TEMPLATE_IDS } from './system-templates';

describe('system templates (studio.system-templates)', () => {
  it('cover the six sectors, each versioned and told apart from a real system', () => {
    expect(SYSTEM_TEMPLATES.map((template) => template.sector)).toEqual(['Fintech', 'E-commerce', 'Telemedicina', 'Movilidad', 'Educación', 'IoT']);
    expect(new Set(SYSTEM_TEMPLATE_IDS).size).toBe(6);
    expect(FICTIONAL_LABEL).toBe('Ejemplo ficticio');
    for (const template of SYSTEM_TEMPLATES) {
      expect(template.id).withContext(template.id).toMatch(/^system-[a-z]+$/);
      expect(template.version).withContext(template.id).toBeGreaterThanOrEqual(1);
      expect(template.description).withContext(template.id).toContain('Ejemplo ficticio: ilustra un tipo de sistema; no describe el de ninguna empresa.');
    }
  });

  it('explain themselves with a few key decisions, one line each', () => {
    for (const template of SYSTEM_TEMPLATES) {
      expect(template.decisions.length).withContext(template.id).toBeGreaterThanOrEqual(2);
      expect(template.decisions.length).withContext(template.id).toBeLessThanOrEqual(4);
      for (const decision of template.decisions) {
        expect(decision).withContext(template.id).not.toContain('\n');
        expect(decision.length).withContext(`${template.id}: ${decision}`).toBeLessThanOrEqual(130);
      }
    }
  });

  it('carry both views: an infrastructure and the system that runs on it', () => {
    for (const template of SYSTEM_TEMPLATES) {
      const project = template.build();

      expect(project.nodes.length).withContext(template.id).toBeGreaterThan(8);
      expect(project.nodes.length).withContext(template.id).toBeLessThanOrEqual(MAX_NODES);
      expect(new Set(project.nodes.map((node) => node.id)).size).withContext(template.id).toBe(project.nodes.length);
      expect(project.system).withContext(template.id).toBeDefined();
      // Las categorías obligatorias, todas elegidas.
      for (const category of SYSTEM_CATALOG.filter((candidate) => !candidate.optional)) {
        expect(chosen(project.system!, category.id)).withContext(`${template.id} · ${category.id}`).not.toBeNull();
      }
    }
  });

  it('start with nothing to fix: valid graph, everything deployed, requirements met and within budget', () => {
    for (const template of SYSTEM_TEMPLATES) {
      const project = template.build();
      const cost = estimateCost(project.nodes, project.provider).total;

      expect(checkGraph(project.nodes, project.links)).withContext(template.id).toEqual([]);
      expect(advisories(project.nodes, project.links)).withContext(template.id).toEqual([]);
      expect(evaluateSystem(project.system!, project.nodes, cost)).withContext(`${template.id} (≈ $${cost})`).toEqual([]);
      // Un presupuesto creíble: el coste estimado lo usa en buena parte, no es un cheque en blanco.
      expect(cost).withContext(template.id).toBeGreaterThan(project.system!.nfr.budgetUsd! * 0.4);
    }
  });

  it('ask for non-functional requirements, including the regulated sectors', () => {
    const nfr = (id: string) => SYSTEM_TEMPLATES.find((template) => template.id === id)!.build().system!.nfr;

    for (const template of SYSTEM_TEMPLATES) {
      const asked = template.build().system!.nfr;
      expect([asked.users, asked.rps, asked.latencyMs, asked.availability, asked.budgetUsd].every((value) => typeof value === 'number'))
        .withContext(template.id).toBeTrue();
    }
    expect(nfr('system-fintech').compliance).toEqual(['pci']);
    expect(nfr('system-telemedicine').compliance).toEqual(['health']);
  });

  it('survive being saved and opened again, and fit their zones', () => {
    for (const template of SYSTEM_TEMPLATES) {
      const project = template.build();

      expect(parseProject(serializeProject(project))).withContext(template.id).toEqual({ ok: true, project });
      for (const zone of project.zones) {
        const count = directNodes(zone, project.nodes, project.zones).length;
        expect(fits(count, zone.w, zone.h)).withContext(`${template.id} · ${zone.id} (${count} nodos)`).toBeTrue();
      }
    }
  });
});
