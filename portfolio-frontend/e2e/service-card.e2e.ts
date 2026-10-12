import { expect, Locator, Page, test, TestInfo } from '@playwright/test';
import { join } from 'node:path';

/**
 * Tarjeta informativa de un servicio del Estudio. Con ratón: aviso al posar el cursor y tarjeta
 * anclada junto al nodo al pulsarlo. Con el dedo (móviles y tabletas): hoja inferior. En los dos
 * casos tiene que verse entera, sin recortes ni partes fuera de la pantalla.
 */
const STUDIO = 'app-cloud-infra';
const CANVAS = `${STUDIO} svg[data-work-canvas]`;
const MOBILE = `${STUDIO} app-studio-mobile-canvas`;
/** Anclada vive dentro del Estudio; como hoja, en <body>. */
const CARD = 'app-service-info-card';

async function openStudio(page: Page): Promise<void> {
  await page.route(/^https:\/\/api\.example\.com\//, (route) => route.abort());
  await page.route(/^https:\/\/raw\.githubusercontent\.com\//, (route) => route.abort());
  await page.goto('/');
  await expect(page.locator('h1')).toBeVisible();
  await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });
  await page.evaluate(() => document.getElementById('cloud')?.scrollIntoView({ block: 'start' }));
  await expect(page.locator(`${CANVAS}, ${MOBILE}`).first()).toBeAttached({ timeout: 15_000 });
  await expect(page.locator(STUDIO)).toBeVisible();
  await page.waitForTimeout(400);
}

/** El nodo tal como se ve: en estrecho, el de la vista vertical; si no, el del lienzo de trabajo. */
async function nodeOf(page: Page, id: string): Promise<Locator> {
  const scope = (await page.locator(MOBILE).count()) > 0 ? MOBILE : CANVAS;
  return page.locator(`${scope} [data-node-id="${id}"]`);
}

async function capture(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const path = join('e2e-screens', testInfo.project.name, `${name}.png`);
  await page.screenshot({ path, animations: 'disabled' });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

/** La tarjeta entera cabe en la ventana y ninguno de sus bloques queda recortado por ella. */
async function expectWhole(page: Page, context: string): Promise<void> {
  // El Estudio se amplía un 3 % al recibir el foco, con una transición, y la tarjeta se recoloca al
  // terminar: se comprueba el estado final, no un fotograma intermedio.
  await expect(() => measureWhole(page, context)).toPass({ timeout: 4000 });
}

async function measureWhole(page: Page, context: string): Promise<void> {
  const viewport = page.viewportSize()!;
  const box = (await page.locator(CARD).boundingBox())!;
  expect(box, `${context}: la tarjeta se ve`).not.toBeNull();
  expect(box.x, `${context}: no se sale por la izquierda`).toBeGreaterThanOrEqual(-0.5);
  expect(box.y, `${context}: no se sale por arriba`).toBeGreaterThanOrEqual(-0.5);
  expect(box.x + box.width, `${context}: no se sale por la derecha`).toBeLessThanOrEqual(viewport.width + 0.5);
  expect(box.y + box.height, `${context}: no se sale por abajo`).toBeLessThanOrEqual(viewport.height + 0.5);
  // Lo que no cabe se desplaza dentro de la tarjeta: cabecera y pie siguen a la vista.
  for (const part of ['header', 'footer']) {
    // Una pieza sin documentación que enlazar (los visitantes) no tiene pie.
    if ((await page.locator(`${CARD} ${part}`).count()) === 0) {
      continue;
    }
    const inner = (await page.locator(`${CARD} ${part}`).boundingBox())!;
    // Con el Estudio ampliado un 3 % por el foco, las medidas llevan decimales: un píxel de margen.
    expect(inner.y, `${context}: ${part} dentro de la tarjeta`).toBeGreaterThanOrEqual(box.y - 1.5);
    expect(inner.y + inner.height, `${context}: ${part} dentro de la tarjeta`).toBeLessThanOrEqual(box.y + box.height + 1.5);
  }
}

const withMouse = (testInfo: TestInfo) => testInfo.project.name.startsWith('desktop-');

test.describe('tarjeta informativa de servicio', () => {
  test('con ratón: aviso al posar el cursor y tarjeta anclada junto al nodo, sin taparlo', async ({ page }, testInfo) => {
    test.skip(!withMouse(testInfo), 'el aviso y la tarjeta anclada son de ratón; con el dedo es una hoja');
    await openStudio(page);
    const node = await nodeOf(page, 'postgres');

    // El primer paso del cursor abre el inspector de traza y la página se recoloca; el aviso se
    // comprueba con todo ya quieto.
    await node.hover();
    await page.waitForTimeout(700);
    await page.mouse.move(5, 5);
    await node.hover();
    // (Que espere 300 ms antes de salir lo comprueba el test unitario, con el reloj controlado.)
    await expect(page.locator(`${STUDIO} [role="tooltip"]`)).toContainText('Base de datos relacional PostgreSQL', { timeout: 2000 });
    await capture(page, testInfo, 'ficha-aviso');

    await node.click();
    const dialog = page.locator(`${CARD} [role="dialog"]`);
    await expect(dialog).toBeVisible();
    await expect(dialog).toBeFocused();
    await expect(dialog.getByRole('heading', { level: 3 })).toHaveText('RDS PostgreSQL');
    await expect(dialog).toContainText('Amazon RDS for PostgreSQL');
    await expect(dialog.getByRole('link', { name: /Documentación oficial/ })).toHaveAttribute('href', /^https:\/\/docs\.aws\.amazon\.com\//);
    await page.waitForTimeout(300);
    await expectWhole(page, 'postgres');
    const card = (await page.locator(CARD).boundingBox())!;
    const anchor = (await node.boundingBox())!;
    const overlaps = card.x < anchor.x + anchor.width && card.x + card.width > anchor.x && card.y < anchor.y + anchor.height && card.y + card.height > anchor.y;
    expect(overlaps, 'la tarjeta no tapa su nodo').toBe(false);
    await capture(page, testInfo, 'ficha-anclada');

    await page.keyboard.press('Escape');
    await expect(page.locator(CARD)).toHaveCount(0);
    await expect(node).toBeFocused();
  });

  test('con ratón: la tarjeta se recoloca en los nodos de los bordes y nunca queda fuera de la pantalla', async ({ page }, testInfo) => {
    test.skip(!withMouse(testInfo), 'solo la tarjeta anclada se recoloca');
    await openStudio(page);

    for (const id of ['users', 'registry', 'static', 'cicd', 'gemini']) {
      const node = await nodeOf(page, id);
      await node.scrollIntoViewIfNeeded();
      await node.click();
      await expect(page.locator(`${CARD} [role="dialog"]`)).toBeVisible();
      await page.waitForTimeout(300);
      await expectWhole(page, id);
      await page.keyboard.press('Escape');
      await expect(page.locator(CARD)).toHaveCount(0);
    }
    const registry = await nodeOf(page, 'registry');
    await registry.click();
    await page.waitForTimeout(300);
    await capture(page, testInfo, 'ficha-anclada-borde');
  });

  test('con ratón: un chip de otra nube cambia el lienzo y deja el mismo nodo seleccionado, con su ficha', async ({ page }, testInfo) => {
    test.skip(!withMouse(testInfo), 'en táctil lo cubre la prueba de la hoja');
    await openStudio(page);
    await (await nodeOf(page, 'postgres')).click();
    const dialog = page.locator(`${CARD} [role="dialog"]`);

    await dialog.locator('[data-provider="gcp"]').click();
    await expect(dialog).toContainText('Cloud SQL for PostgreSQL');
    await expect(page.locator(`${STUDIO} [role="radio"][aria-checked="true"]`).first()).toContainText('GCP');
    // La ficha sigue en el mismo nodo, ya con su nombre en la otra nube. (Que quede seleccionado lo
    // comprueba el test unitario: aquí el cursor puede caer sobre otro nodo al recolocarse la tarjeta.)
    await expect(dialog.getByRole('heading', { level: 3 })).toHaveText('Cloud SQL');
    await page.waitForTimeout(300);
    await expectWhole(page, 'postgres en GCP');
    await capture(page, testInfo, 'ficha-otra-nube');
  });

  test('con ratón, en edición: el clic solo selecciona y la ficha se abre con el botón «i» del nodo', async ({ page }, testInfo) => {
    test.skip(!withMouse(testInfo), 'la edición es de escritorio');
    await openStudio(page);
    await page.locator(`${STUDIO} button`, { hasText: 'Editar arquitectura' }).click();
    const node = await nodeOf(page, 'postgres');

    await node.click();
    await expect(node).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator(CARD)).toHaveCount(0);

    await page.locator(`${CANVAS} g.info`).click();
    await expect(page.locator(`${CARD} [role="dialog"]`)).toBeVisible();
    await page.waitForTimeout(300);
    await expectWhole(page, 'postgres en edición');
  });

  test('con el dedo: al tocar un nodo sube una hoja inferior entera, que se cierra con «Cerrar» o deslizándola', async ({ page }, testInfo) => {
    test.skip(withMouse(testInfo), 'la hoja inferior es de móviles y tabletas');
    await openStudio(page);
    const node = await nodeOf(page, 'postgres');
    await node.scrollIntoViewIfNeeded();

    await node.tap();
    const dialog = page.locator(`${CARD} [role="dialog"]`);
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await expect(dialog.getByRole('heading', { level: 3 })).toHaveText('RDS PostgreSQL');
    await page.waitForTimeout(300);
    await expectWhole(page, 'hoja');
    const viewport = page.viewportSize()!;
    const sheet = (await page.locator(CARD).boundingBox())!;
    expect(sheet.y, 'la hoja deja a la vista parte de la página').toBeGreaterThan(24);
    expect(sheet.width, 'la hoja no es más ancha que la pantalla').toBeLessThanOrEqual(viewport.width);
    const close = (await dialog.getByRole('button', { name: 'Cerrar' }).boundingBox())!;
    expect(Math.min(close.width, close.height), '«Cerrar» mide 44 px').toBeGreaterThanOrEqual(44);
    for (const chip of await dialog.locator('[data-provider]').all()) {
      expect((await chip.boundingBox())!.height, 'chip de 44 px').toBeGreaterThanOrEqual(44);
    }
    await capture(page, testInfo, 'ficha-hoja');

    await dialog.getByRole('button', { name: 'Cerrar' }).tap();
    await expect(page.locator(CARD)).toHaveCount(0);

    // Deslizar hacia abajo desde el asa también la cierra.
    await node.tap();
    await expect(dialog).toBeVisible();
    const handle = (await page.getByTestId('sheet-handle').boundingBox())!;
    const x = handle.x + handle.width / 2;
    const y = handle.y + handle.height / 2;
    await page.getByTestId('sheet-handle').dispatchEvent('pointerdown', { clientX: x, clientY: y, pointerId: 1, pointerType: 'touch', bubbles: true });
    await page.getByTestId('sheet-handle').dispatchEvent('pointermove', { clientX: x, clientY: y + 140, pointerId: 1, pointerType: 'touch', bubbles: true });
    await page.getByTestId('sheet-handle').dispatchEvent('pointerup', { clientX: x, clientY: y + 140, pointerId: 1, pointerType: 'touch', bubbles: true });
    await expect(page.locator(CARD)).toHaveCount(0);
  });

  test('con el dedo: un chip de otra nube cambia el diagrama y la hoja sigue en el mismo nodo', async ({ page }, testInfo) => {
    test.skip(withMouse(testInfo), 'la hoja inferior es de móviles y tabletas');
    await openStudio(page);
    const node = await nodeOf(page, 'postgres');
    await node.scrollIntoViewIfNeeded();
    await node.tap();
    const dialog = page.locator(`${CARD} [role="dialog"]`);

    await dialog.locator('[data-provider="azure"]').tap();
    await expect(dialog).toContainText('Azure Database for PostgreSQL');
    await page.waitForTimeout(300);
    await expectWhole(page, 'hoja en Azure');
  });
});
