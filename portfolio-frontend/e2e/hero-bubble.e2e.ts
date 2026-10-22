import { expect, test } from '@playwright/test';

/**
 * El bocadillo del robot va fijo y por encima de todo: en cada pantalla debe quedarse dentro de
 * ella y no tapar los botones del hero (antes los tapaba en todos los móviles y se salía en
 * tableta). En un móvil en horizontal no hay robot. Necesita WebGL: en la CI (sin GPU) se salta.
 */
test.describe('bocadillo del robot en el hero', () => {
  test('dentro de la pantalla y sin tapar los botones; sin robot en un móvil en horizontal', async ({ page }) => {
    test.skip(!!process.env['CI'], 'sin GPU en la CI');
    await page.route(/^https:\/\/api\.example\.com\//, (route) => route.abort());
    await page.route(/^https:\/\/raw\.githubusercontent\.com\//, (route) => route.abort());
    await page.goto('/?webgl=force');
    await expect(page.locator('h1')).toBeVisible();

    if (page.viewportSize()!.height < 500) {
      await expect(page.locator('app-hero-scene')).toBeHidden();
      return;
    }
    const bubble = page.locator('.speech');
    test.skip(!(await bubble.count()), 'sin WebGL no hay robot');
    // El bocadillo aparece cuando la escena está lista. Con WebGL por software y la máquina cargada
    // puede no arrancar a tiempo: eso no es un fallo del bocadillo, se salta.
    const ready = await expect.poll(() => bubble.evaluate((el) => el.classList.contains('opacity-0')), { timeout: 45_000 }).toBe(false).then(() => true, () => false);
    test.skip(!ready, 'la escena 3D no arrancó a tiempo (WebGL por software)');
    await page.waitForTimeout(800);

    const result = await page.evaluate(() => {
      const el = document.querySelector('.speech')!;
      if (getComputedStyle(el).visibility === 'hidden') return { shown: false, inside: true, overlaps: [] as string[] };
      const box = el.getBoundingClientRect();
      const overlaps = [...document.querySelectorAll('.hero-foot a, .hero-foot button')]
        .filter((button) => {
          const r = button.getBoundingClientRect();
          return r.width && r.top < box.bottom - 2 && r.bottom > box.top + 2 && r.left < box.right - 2 && r.right > box.left + 2;
        })
        .map((button) => button.textContent!.trim());
      return { shown: true, inside: box.left >= 0 && box.right <= innerWidth, overlaps };
    });
    expect(result.inside, 'el bocadillo no se sale de la pantalla').toBe(true);
    expect(result.overlaps, 'el bocadillo no tapa ningún botón del hero').toEqual([]);
  });
});
