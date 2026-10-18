import { expect, test } from '@playwright/test';

/** Ramas fusionadas: se leen en cualquier pantalla y cada una cuenta qué pasó en su CI. */
test.describe('ramas fusionadas en main', () => {
  test('cada merge abre lo que pasó en su CI, sin desbordar la página', async ({ page }) => {
    await page.route(/^https:\/\/api\.example\.com\//, (route) => route.abort());
    // Sin la copia remota: vale la incluida en el sitio (public/pipeline-status.json).
    await page.route(/^https:\/\/raw\.githubusercontent\.com\//, (route) => route.abort());
    await page.goto('/');
    await expect(page.locator('h1')).toBeVisible();
    await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });
    await page.evaluate(() => document.getElementById('entrega')?.scrollIntoView({ block: 'start' }));
    const card = page.locator('app-merge-history');
    const first = card.locator('[data-merge]').first();
    await first.scrollIntoViewIfNeeded();
    await expect(first).toBeVisible({ timeout: 15_000 });

    await first.click();
    const detail = card.locator('div[aria-live="polite"]');
    await expect(detail).toBeVisible();
    await expect(detail).toContainText('CI del merge');
    await expect(detail).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  });
});
