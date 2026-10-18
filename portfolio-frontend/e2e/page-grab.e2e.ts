import { expect, test } from '@playwright/test';

/** «La manita»: con el ratón, arrastrar el fondo de la página la desplaza; un texto, no. */
test.describe('arrastrar el fondo para desplazarse', () => {
  test('arrastrar hacia arriba sobre el fondo baja la página', async ({ page }) => {
    await page.route(/^https:\/\/api\.example\.com\//, (route) => route.abort());
    await page.route(/^https:\/\/raw\.githubusercontent\.com\//, (route) => route.abort());
    await page.goto('/');
    await expect(page.locator('h1')).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('page-grab'))).toBe(true);
    await page.evaluate(() => document.getElementById('plataforma')?.scrollIntoView());
    const start = await page.evaluate(() => scrollY);
    // Margen izquierdo, fuera de las tarjetas: es fondo.
    await page.mouse.move(40, 600);
    await page.mouse.down();
    await page.mouse.move(40, 300, { steps: 8 });
    await page.mouse.up();
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(start + 200);
  });
});

/** El estilo de las tarjetas (luz que sigue al cursor) no puede romper el modo teatro. */
test.describe('ampliar una tarjeta de diagrama', () => {
  test('ocupa la ventana y se ve, aunque la tarjeta tenga el efecto de luz', async ({ page }) => {
    await page.route(/^https:\/\/api\.example\.com\//, (route) => route.abort());
    await page.route(/^https:\/\/raw\.githubusercontent\.com\//, (route) => route.abort());
    await page.goto('/');
    await expect(page.locator('h1')).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('page-grab'))).toBe(true);
    await page.evaluate(() => document.getElementById('entrega')?.scrollIntoView());
    const card = page.locator('app-production-architecture');
    await card.scrollIntoViewIfNeeded();
    await card.hover();
    await card.locator('app-theater-toggle button').first().click();
    await expect(card).toHaveClass(/theater-expanded/);
    await page.waitForTimeout(700);

    const box = (await card.boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(box.y, 'arriba del todo').toBeLessThanOrEqual(1);
    expect(box.height, 'no más alta que la ventana').toBeLessThanOrEqual(viewport.height + 1);
    await expect(card).toBeInViewport();
  });
});
