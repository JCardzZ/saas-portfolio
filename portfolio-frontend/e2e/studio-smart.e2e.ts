import { expect, Page, test, TestInfo } from '@playwright/test';
import { join } from 'node:path';

/**
 * Lo que enciende la flag `studio.smart-rules` en el Estudio. Se prueba el build de producción
 * en modo demo (sin backend), donde las flags se encienden en el navegador (`demo-feature-flags`).
 * En móviles y tabletas solo se comprueba la lectura; la edición, en escritorio.
 */
const CANVAS = 'app-cloud-infra svg[role="group"]';

async function openStudio(page: Page, flags: Record<string, boolean>): Promise<void> {
  await page.addInitScript((value) => localStorage.setItem('demo-feature-flags', value), JSON.stringify(flags));
  await page.route(/^https:\/\/api\.example\.com\//, (route) => route.abort());
  await page.route(/^https:\/\/raw\.githubusercontent\.com\//, (route) => route.abort());
  await page.goto('/');
  await expect(page.locator('h1')).toBeVisible();
  await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });
  await page.evaluate(() => document.getElementById('cloud')?.scrollIntoView({ block: 'start' }));
  await expect(page.locator(CANVAS)).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(400);
}

async function capture(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const path = join('e2e-screens', testInfo.project.name, `${name}.png`);
  // El lienzo con lo que flota sobre él (o, con la vista ajustada, debajo).
  await page.locator('app-cloud-infra .theater-stage').locator('..').screenshot({ path, animations: 'disabled' });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

async function viewMenuItem(page: Page, text: string) {
  await page.locator('app-cloud-infra [aria-controls="menu-view"]').click();
  return page.locator('#menu-view button', { hasText: text });
}

const isDesktop = (testInfo: TestInfo) => testInfo.project.name.startsWith('desktop-');

test.describe('lienzo responsivo del Estudio (studio.smart-rules)', () => {
  test('«Ajustar a pantalla» muestra el diagrama entero, sin desplazar el marco ni la página', async ({ page }, testInfo) => {
    await openStudio(page, { 'studio.smart-rules': true });
    await capture(page, testInfo, 'hito-1-ajustar-antes');

    await (await viewMenuItem(page, 'Ajustar a pantalla')).click();
    await expect(page.locator(CANVAS)).toHaveClass(/canvas-fitted/);

    const frame = await page.locator('app-cloud-infra .theater-stage').evaluate((stage) => ({
      scroll: stage.scrollWidth, client: stage.clientWidth,
    }));
    expect(frame.scroll, 'el marco del lienzo no se desplaza en horizontal').toBeLessThanOrEqual(frame.client + 1);
    const page_ = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    expect(page_.scroll, 'la página no se desplaza en horizontal').toBeLessThanOrEqual(page_.client + 1);
    // El diagrama cabe además a lo alto de la ventana.
    const box = (await page.locator(CANVAS).boundingBox())!;
    expect(box.height).toBeLessThanOrEqual(page.viewportSize()!.height);
    await capture(page, testInfo, 'hito-1-ajustar-despues');

    await (await viewMenuItem(page, 'Ver el lienzo completo')).click();
    await expect(page.locator(CANVAS)).not.toHaveClass(/canvas-fitted/);
    await expect(page.locator(CANVAS)).toHaveAttribute('viewBox', '0 0 1110 716');
  });

  test('con la flag apagada el menú Ver no ofrece nada nuevo', async ({ page }) => {
    await openStudio(page, {});

    await page.locator('app-cloud-infra [aria-controls="menu-view"]').click();
    await expect(page.locator('#menu-view')).toContainText('Auto-ordenar');
    await expect(page.locator('#menu-view')).not.toContainText('Ajustar a pantalla');
  });

  test('al encoger una subred, sus nodos se reacomodan dentro y no se solapan', async ({ page }, testInfo) => {
    test.skip(!isDesktop(testInfo), 'la edición se prueba en escritorio');
    await openStudio(page, { 'studio.smart-rules': true });
    await page.getByRole('button', { name: 'Editar arquitectura' }).click();
    await capture(page, testInfo, 'hito-1-redimensionar-antes');

    const grip = page.locator('app-cloud-infra rect.zone-grip[aria-label*="Subred privada · datos"]');
    await grip.focus();
    for (let step = 0; step < 40; step++) {
      await page.keyboard.press('Shift+ArrowUp');
    }

    const layout = await page.locator(CANVAS).evaluate((svg) => {
      const rect = svg.querySelector('rect.zone[data-zone-id="subnet-data"]')!.getBoundingClientRect();
      const nodes = Array.from(svg.querySelectorAll('g.node'))
        .filter((node) => /PostgreSQL|ElastiCache/.test(node.textContent ?? ''))
        .map((node) => node.querySelector('rect')!.getBoundingClientRect());
      return {
        zone: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
        nodes: nodes.map((node) => ({ left: node.left, top: node.top, right: node.right, bottom: node.bottom })),
      };
    });
    expect(layout.nodes.length).toBe(2);
    for (const node of layout.nodes) {
      expect(node.left, 'dentro por la izquierda').toBeGreaterThanOrEqual(layout.zone.left - 1);
      expect(node.right, 'dentro por la derecha').toBeLessThanOrEqual(layout.zone.right + 1);
      expect(node.top, 'dentro por arriba').toBeGreaterThanOrEqual(layout.zone.top - 1);
      expect(node.bottom, 'dentro por abajo').toBeLessThanOrEqual(layout.zone.bottom + 1);
    }
    const [first, second] = layout.nodes;
    const apart = first.right <= second.left + 1 || second.right <= first.left + 1 || first.bottom <= second.top + 1 || second.bottom <= first.top + 1;
    expect(apart, 'los dos nodos no se pisan').toBe(true);
    await capture(page, testInfo, 'hito-1-redimensionar-despues');
  });
});
