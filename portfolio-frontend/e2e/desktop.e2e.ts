import { expect, Page, test, TestInfo } from '@playwright/test';
import { join } from 'node:path';

/** Tamaño máximo de un logo dentro de un nodo: 16 px, 20 px en el activo. */
const MAX_ICON = 24;
const VIEWS = ['app-production-architecture', 'app-pipeline-view'];

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
  test('los logos de los nodos miden 16 px (20 el activo) y nunca tapan el diagrama', async ({ page }) => {
    await openDelivery(page);

    const sizes = () => page.locator('app-stage-graph .node .icon').evaluateAll((icons) =>
      icons.map((icon) => { const rect = icon.getBoundingClientRect(); return [Math.round(rect.width), Math.round(rect.height)]; }));

    const resting = await sizes();
    expect(resting.length).toBeGreaterThan(4);
    for (const [width, height] of resting) {
      expect(width, 'ancho de un logo').toBe(16);
      expect(height, 'alto de un logo').toBe(16);
    }

    // El logo del nodo elegido crece a 20 px; ninguno pasa de 24. El cursor se aparta para medir
    // la tarjeta en reposo (al pasar por encima, toda la tarjeta hace un zoom del 2 %).
    await page.locator('app-production-architecture button.node').first().click();
    await page.mouse.move(0, 0);
    await page.waitForTimeout(900);
    const active = await sizes();
    expect(Math.max(...active.flat())).toBe(20);
    expect(Math.max(...active.flat())).toBeLessThanOrEqual(MAX_ICON);
    // Nada que flote sobre el diagrama: el logo no sale de su nodo.
    await expect(page.locator('app-icon-pop-layer [data-pop], app-icon-pop-layer .pop')).toHaveCount(0);
  });

  test('los nodos son tarjetas de 52 px en columnas por etapa y las píldoras del pipeline miden 36', async ({ page }) => {
    await openDelivery(page);

    const boxes = (view: string) => page.locator(`${view} button.node`).evaluateAll((nodes) =>
      nodes.map((node) => { const rect = node.getBoundingClientRect(); return { left: Math.round(rect.left), height: Math.round(rect.height) }; }));

    const architecture = await boxes('app-production-architecture');
    expect(new Set(architecture.map((box) => box.height))).toEqual(new Set([52]));
    expect(new Set(architecture.map((box) => box.left)).size).toBe(5);
    await expect(page.locator('app-production-architecture .stage-name')).toHaveText(['Código', 'CI/CD', 'Artefactos', 'Ejecución', 'Datos']);

    const pipeline = await boxes('app-pipeline-view');
    expect(new Set(pipeline.map((box) => box.height))).toEqual(new Set([36]));
    expect(new Set(pipeline.map((box) => box.left)).size).toBeGreaterThan(4);
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
    for (const view of VIEWS) {
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
