import { expect, Page, test, TestInfo } from '@playwright/test';
import { join } from 'node:path';

/** Tamaño máximo de un logo dentro de un nodo: 16 px, 20 px en el activo. */
const MAX_ICON = 24;
const VIEWS = ['app-production-architecture', 'app-pipeline-view'];
const CAPTURED = [...VIEWS, 'app-deploy-timeline'];

async function openDelivery(page: Page): Promise<void> {
  await page.route(/^https:\/\/api\.example\.com\//, (route) => route.abort());
  await page.route(/^https:\/\/raw\.githubusercontent\.com\//, (route) => route.abort());
  await page.goto('/');
  await expect(page.locator('h1')).toBeVisible();
  await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });
  await page.evaluate(() => document.getElementById('entrega')?.scrollIntoView({ block: 'start' }));
  await expect(page.locator('app-pipeline-view button.node').first()).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(500);
}

async function capture(page: Page, testInfo: TestInfo, selector: string, name: string): Promise<void> {
  const path = join('e2e-screens', testInfo.project.name, `${name}.png`);
  await page.locator(selector).screenshot({ path, animations: 'disabled' });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

test.describe('arquitectura real y pipeline en escritorio', () => {
  test('ningún nodo lleva un logo sin permiso de marca: los nombres van en texto y nada mide más de 24 px', async ({ page }) => {
    await openDelivery(page);

    // Cualquier imagen o icono dentro de un nodo, si lo hubiera, cabe en 24 px.
    const sizes = await page.locator('app-stage-graph .node :is(svg, img)').evaluateAll((icons) =>
      icons.map((icon) => { const rect = icon.getBoundingClientRect(); return Math.max(rect.width, rect.height); }));
    for (const size of sizes) {
      expect(size, 'tamaño de un icono de nodo').toBeLessThanOrEqual(MAX_ICON);
    }
    // Cloudflare y los proveedores de IA no dan permiso de uso del logo: solo su nombre.
    for (const label of ['Cloudflare Pages', 'Gemini', 'GHCR']) {
      const node = page.locator('app-production-architecture button.node', { hasText: label });
      await expect(node).toBeVisible();
      await expect(node.locator('svg, img')).toHaveCount(0);
    }
    // Nada que flote sobre el diagrama.
    await expect(page.locator('app-stage-graph app-tech-icon')).toHaveCount(0);
  });

  test('el diagrama respira: columnas a 48 px o más, nodos a 24 px o más, y nada se solapa', async ({ page }) => {
    await openDelivery(page);

    for (const view of VIEWS) {
      const boxes = await page.locator(`${view} button.node`).evaluateAll((nodes) =>
        nodes.map((node) => { const r = node.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; }));
      expect(new Set(boxes.map((box) => box.h)), `${view}: alto de los nodos`).toEqual(new Set([view === 'app-pipeline-view' ? 36 : 52]));

      for (const a of boxes) {
        for (const b of boxes) {
          if (a === b) {
            continue;
          }
          const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
          const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
          expect(overlapX > 0 && overlapY > 0, `${view}: dos nodos se solapan`).toBe(false);
          // Misma columna: al menos 24 px entre uno y el siguiente.
          if (a.x === b.x && b.y > a.y) {
            expect(b.y - (a.y + a.h), `${view}: separación vertical`).toBeGreaterThanOrEqual(24);
          }
          // Columnas vecinas de la misma franja: al menos 48 px.
          if (b.x > a.x && overlapY > 0) {
            expect(b.x - (a.x + a.w), `${view}: separación entre columnas`).toBeGreaterThanOrEqual(48);
          }
        }
      }
      // Cabe en su tarjeta: el diagrama se reorganiza, no obliga a desplazarse de lado.
      const overflow = await page.locator(`${view} .scroller`).evaluate((scroller) => scroller.scrollWidth - scroller.clientWidth);
      expect(overflow, `${view}: desborde horizontal`).toBeLessThanOrEqual(0);
    }
    await expect(page.locator('app-production-architecture .stage-name')).toHaveText(['Código', 'CI/CD', 'Artefactos', 'Ejecución', 'Datos']);
  });

  test('zoom y «ajustar a pantalla»: el pipeline pasa de varias franjas a una sola, a escala', async ({ page }, testInfo) => {
    await openDelivery(page);
    const view = page.locator('app-pipeline-view');
    const rows = () => view.locator('button.node', { hasText: /^Cambios|gate/ }).evaluateAll((nodes) =>
      nodes.map((node) => Math.round(node.getBoundingClientRect().top)));

    // A tamaño real no cabe en una franja: la última etapa queda más abajo que la primera.
    const [first, last] = await rows();
    expect(last - first).toBeGreaterThan(100);
    await expect(view.locator('.level')).toHaveText('100 %');

    await view.getByRole('button', { name: 'Ajustar a pantalla' }).click();
    await page.waitForTimeout(300);
    const overflow = await view.locator('.scroller').evaluate((scroller) => scroller.scrollWidth - scroller.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    expect(Number((await view.locator('.level').textContent())!.replace(/\D/g, ''))).toBeLessThan(100);
    await capture(page, testInfo, 'app-pipeline-view', 'pipeline-ajustado-a-pantalla');

    await view.getByRole('button', { name: 'Tamaño real' }).click();
    await view.getByRole('button', { name: 'Alejar' }).click();
    await expect(view.locator('.level')).toHaveText('80 %');
    await view.getByRole('button', { name: 'Acercar' }).click();
    await expect(view.locator('.level')).toHaveText('100 %');
  });

  test('se recorre con el teclado, con el foco visible', async ({ page }) => {
    await openDelivery(page);
    const graph = page.locator('app-production-architecture');

    await graph.locator('button.node', { hasText: 'GitHub Actions' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(graph.locator('button.node', { hasText: 'GHCR' })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(graph.locator('button.node', { hasText: 'Cloudflare Pages' })).toBeFocused();
    await page.keyboard.press('Home');
    const first = graph.locator('button.node').first();
    await expect(first).toBeFocused();
    // El foco se ve (anillo) e ilumina el camino igual que el cursor.
    expect(await first.evaluate((node) => getComputedStyle(node).outlineStyle !== 'none' || getComputedStyle(node).boxShadow !== 'none')).toBe(true);
    await expect(graph.locator('.graph.focused')).toHaveCount(1);
    await page.keyboard.press('Enter');
    await expect(graph.locator('div[aria-live="polite"]')).toContainText('Por qué');
  });

  test('al señalar un nodo se ilumina su camino y el resto baja al 40 %', async ({ page }, testInfo) => {
    await openDelivery(page);
    const graph = page.locator('app-production-architecture');
    const actions = graph.locator('button.node', { hasText: 'GitHub Actions' });

    await actions.hover();
    await page.waitForTimeout(450);

    const opacity = (label: string) => graph.locator('button.node', { hasText: label }).evaluate((node) => getComputedStyle(node).opacity);
    // GitHub Actions recibe de GitHub y entrega a GHCR y a Pages: esos cuatro se quedan encendidos.
    for (const label of ['GitHub Actions', 'GHCR', 'Cloudflare Pages']) {
      expect(await opacity(label), label).toBe('1');
    }
    for (const label of ['Neon', 'Upstash', 'Visitante']) {
      expect(await opacity(label), label).toBe('0.4');
    }
    expect(await graph.locator('svg.edges path.lit').count()).toBe(3);
    await capture(page, testInfo, 'app-production-architecture', 'arquitectura-camino-iluminado');
  });

  test('lo planificado va punteado y sin punto de luz; lo que está en producción, con uno', async ({ page }) => {
    await openDelivery(page);
    const graph = page.locator('app-production-architecture');

    const planned = graph.locator('button.node.tone-planned').first();
    expect(await planned.evaluate((node) => getComputedStyle(node).borderTopStyle)).toBe('dashed');
    expect(await graph.locator('button.node.tone-ok').first().evaluate((node) => getComputedStyle(node).borderTopStyle)).toBe('solid');

    const edges = await graph.locator('svg.edges path').count();
    const dashed = await graph.locator('svg.edges path.planned').count();
    expect(dashed).toBeGreaterThan(0);
    // Un punto de luz por conexión en vivo, ninguno en las planificadas.
    await expect(graph.locator('.spark')).toHaveCount(edges - dashed);
    // El pipeline no lleva puntos de luz.
    await expect(page.locator('app-pipeline-view .spark')).toHaveCount(0);
  });

  test('con movimiento reducido no hay puntos de luz en marcha', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openDelivery(page);

    expect(await page.locator('app-production-architecture .spark').evaluateAll((sparks) =>
      sparks.filter((spark) => getComputedStyle(spark).display !== 'none').length)).toBe(0);
  });

  test('capturas de las dos vistas, con la ficha abierta debajo del diagrama', async ({ page }, testInfo) => {
    await openDelivery(page);
    for (const view of CAPTURED) {
      await capture(page, testInfo, view, `${view.replace('app-', '')}`);
    }

    await page.locator('app-pipeline-view button.node', { hasText: 'Backend unit' }).click();
    const detail = page.locator('app-pipeline-view div[aria-live="polite"]');
    await expect(detail).toContainText('Por qué existe');
    const graphBox = (await page.locator('app-pipeline-view app-stage-graph').boundingBox())!;
    const detailBox = (await detail.boundingBox())!;
    expect(detailBox.y, 'la ficha se abre debajo del grafo, no encima').toBeGreaterThanOrEqual(graphBox.y + graphBox.height);
    await page.mouse.move(0, 0);
    await capture(page, testInfo, 'app-pipeline-view', 'pipeline-view-con-ficha');

    // Sin scroll horizontal de página en escritorio.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe('patrones de datos en el Estudio, en escritorio', () => {
  async function openStudio(page: Page): Promise<void> {
    await page.route(/^https:\/\/api\.example\.com\//, (route) => route.abort());
    await page.route(/^https:\/\/raw\.githubusercontent\.com\//, (route) => route.abort());
    await page.goto('/');
    await expect(page.locator('h1')).toBeVisible();
    await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });
    await page.evaluate(() => document.getElementById('cloud')?.scrollIntoView({ block: 'start' }));
    await expect(page.locator('#cloud app-data-blueprints li[data-blueprint]')).toHaveCount(3, { timeout: 15_000 });
    await page.waitForTimeout(400);
  }

  test('la galería muestra los tres patrones en una fila y los traduce a la nube del lienzo', async ({ page }, testInfo) => {
    await openStudio(page);
    const gallery = page.locator('app-data-blueprints');
    const tops = await gallery.locator('li[data-blueprint]').evaluateAll((cards) => cards.map((card) => Math.round(card.getBoundingClientRect().top)));
    expect(new Set(tops).size, 'las tres tarjetas en la misma fila').toBe(1);
    await expect(gallery.locator('li[data-blueprint="cdc-realtime"]')).toContainText('RDS PostgreSQL → Database Migration Service → Redshift');

    await page.locator('app-cloud-infra [role="radio"]', { hasText: 'Azure' }).click();
    await expect(gallery.locator('li[data-blueprint="cdc-realtime"]')).toContainText('Data Factory (CDC)');
    await expect(gallery.locator('li[data-blueprint="multi-region-recovery"]')).toContainText('Azure SQL Database (failover groups)');
    await gallery.scrollIntoViewIfNeeded();
    await capture(page, testInfo, 'app-data-blueprints', 'patrones-de-datos');
  });

  test('cargar un patrón reemplaza el lienzo, sin avisos, y el filtro Grafo enseña el diff', async ({ page }, testInfo) => {
    await openStudio(page);
    const studio = page.locator('app-cloud-infra');
    const card = page.locator('li[data-blueprint="event-analytics"]');
    await card.getByRole('button', { name: 'Cargar en el lienzo' }).click();
    await card.getByRole('button', { name: 'Reemplazar' }).click();

    await expect(studio.locator('svg text.node-service', { hasText: 'Kinesis Data Streams' })).toBeVisible();
    await expect(studio.locator('path.wire[data-kind="EVENT_BUS"]')).toHaveCount(3);
    await expect(studio.locator('path.wire[data-kind="ANALYTICS_SINK"]')).toHaveCount(2);
    await expect(studio.locator('[data-testid="graph-warnings"]')).toHaveCount(0);
    await expect(studio.locator('[data-testid="rule-badge"]')).toHaveCount(0);
    // Los nodos del patrón no se pisan.
    const spots = await studio.locator('g.node').evaluateAll((nodes) => nodes.map((node) => { const r = node.getBoundingClientRect(); return `${Math.round(r.left)},${Math.round(r.top)}`; }));
    expect(new Set(spots).size, 'nodos en posiciones distintas').toBe(spots.length);
    await capture(page, testInfo, 'app-cloud-infra', 'estudio-analitica-por-eventos');

    await studio.getByRole('button', { name: 'Grafo', exact: true }).click();
    const inspector = page.locator('app-trace-inspector');
    await expect(inspector.locator('h3')).toContainText('Grafo');
    await expect(inspector.locator('[data-testid="graph-entry"]').first()).toContainText('[Graph Diff]');
    await expect(inspector.locator('[data-testid="graph-entry"]').first()).toContainText('+ nodo');
    await inspector.getByRole('button', { name: 'Ver JSON completo' }).click();
    await expect(inspector.locator('[data-testid="graph-json"]')).toContainText('"kind": "EVENT_BUS"');
    await expect(inspector.locator('[data-testid="graph-json"]')).toContainText('"version": 2');
  });

  test('una instancia duplicada y un servicio sin Terraform ni coste se avisan a la vista', async ({ page }, testInfo) => {
    await openStudio(page);
    const studio = page.locator('app-cloud-infra');
    await studio.getByRole('button', { name: 'Editar arquitectura' }).click();
    const add = studio.locator('app-service-catalog button[aria-label^="Añadir Tableau"]');
    await add.click();
    await add.click();

    await expect(studio.locator('[data-testid="graph-warnings"] li')).toHaveText(['Instancia duplicada: Tableau #2. Este lienzo admite una sola.']);
    await expect(studio.locator('[data-testid="rule-badge"]')).toHaveCount(1);
    await expect(studio.locator('app-cost-badge')).toContainText('+2 sin estimación');
    await studio.getByRole('button', { name: 'main.tf', exact: true }).click();
    await expect(studio.locator('[data-testid="terraform-gap"]').first()).toHaveText('Tableau: sin soporte de Terraform todavía');
    await expect(studio.locator('#main-tf-panel pre')).toContainText('# Tableau: sin soporte de Terraform todavía');
    await capture(page, testInfo, 'app-cloud-infra', 'estudio-avisos-de-reglas');
  });
});
