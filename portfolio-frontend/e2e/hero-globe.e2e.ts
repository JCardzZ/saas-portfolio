import { expect, test } from '@playwright/test';

/**
 * El globo de tecnologías del hero: se abre pulsando el robot (o con Intro), se filtra por grupo
 * y se recoge con Esc. Sin WebGL el robot no se pinta y no hay nada que probar.
 */
test.describe('globo de tecnologías del hero', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    // La escena 3D se dibuja por software en la CI (lentísimo): se prueba en dos perfiles, forzándola.
    test.skip(!/^(desktop-1440|iphone-390)-/.test(testInfo.project.name), 'solo escritorio e iPhone 390');
    // En la CI no hay GPU: forzar el 3D por software lo vuelve tan lento que se agota el tiempo.
    test.skip(!!process.env['CI'], 'sin GPU en la CI');
    await page.route(/^https:\/\/api\.example\.com\//, (route) => route.abort());
    await page.route(/^https:\/\/raw\.githubusercontent\.com\//, (route) => route.abort());
    // Un móvil en horizontal (menos de 500 px de alto) no tiene sitio para el robot: el hero se
    // desplaza y su centro queda bajo el texto. Ahí no se prueba ni el globo ni el «cabe entero».
    test.skip(page.viewportSize()!.height < 500, 'móvil en horizontal');
    await page.goto('/?webgl=force');
    await expect(page.locator('h1')).toBeVisible();
  });

  test('se abre, se filtra y se recoge, con ratón, dedo o teclado', async ({ page }) => {
    const toggle = page.getByTestId('hero-stack-toggle');
    test.skip((await toggle.count()) === 0, 'sin WebGL no hay robot');
    // La escena carga Three.js aparte; está lista cuando aparece el bocadillo del robot (la antigua
    // píldora de ayuda dentro del botón ya no existe: la invitación va en el bocadillo).
    await expect.poll(() => page.locator('.speech').evaluate((el) => el.classList.contains('opacity-0')), { timeout: 45_000 }).toBe(false);
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    const filters = page.getByTestId('stack-filters');
    await expect(filters).toBeVisible();
    // Abre mostrando lo que usa la plataforma.
    await expect(filters.getByRole('radio').first()).toHaveAttribute('aria-checked', 'true');

    const aws = filters.getByRole('radio', { name: /AWS/ });
    await aws.click();
    await expect(aws).toHaveAttribute('aria-checked', 'true');
    // El filtro no recoge el mazo.
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');

    await toggle.focus();
    await page.keyboard.press('Escape');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(filters).toBeHidden();

    await page.keyboard.press('Enter');
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  });

  test('el hero cabe en la primera pantalla: el nombre, el rol y la descarga del CV a la vista', async ({ page }) => {
    const viewport = page.viewportSize()!;
    for (const locator of [page.locator('h1'), page.getByTestId('hero-role'), page.locator('.hero').getByRole('button', { name: /CV/ }).first()]) {
      const box = await locator.boundingBox();
      expect(box, 'elemento del hero sin caja').not.toBeNull();
      expect(box!.y + box!.height, 'queda por debajo de la primera pantalla').toBeLessThanOrEqual(viewport.height + 1);
    }
  });
});
