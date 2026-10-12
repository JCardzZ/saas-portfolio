import { expect, Page, test, TestInfo } from '@playwright/test';
import { join } from 'node:path';

/**
 * La sección «Usa mi plataforma desde tu IA» (flag `mcp.section`), sobre el build de producción
 * en modo demo: sin servidor, lo que se enseña sale de la grabación de una sesión MCP real, y
 * se dice. Corre en todos los perfiles; nada de la sección se edita, así que vale igual en móvil.
 */
const SECTION = 'section#mcp';

async function open(page: Page, flags: Record<string, boolean>): Promise<void> {
  await page.addInitScript((value) => localStorage.setItem('demo-feature-flags', value), JSON.stringify(flags));
  await page.route(/^https:\/\/api\.example\.com\//, (route) => route.abort());
  await page.route(/^https:\/\/raw\.githubusercontent\.com\//, (route) => route.abort());
  await page.goto('/');
  await expect(page.locator('h1')).toBeVisible();
  await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });
}

async function capture(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const path = join('e2e-screens', testInfo.project.name, `${name}.png`);
  await page.locator(SECTION).screenshot({ path, animations: 'disabled' });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

test.describe('sección del servidor MCP (mcp.section)', () => {
  test('con la flag apagada la sección no existe', async ({ page }) => {
    await open(page, {});

    await expect(page.locator(SECTION)).toHaveCount(0);
    await expect(page.locator('app-mcp-section')).toHaveCount(0);
  });

  test('explica cómo conectarse y enseña herramientas, estado, grabación y evaluaciones sin desbordar la página', async ({ page }, testInfo) => {
    await open(page, { 'mcp.section': true });
    await page.evaluate(() => document.getElementById('mcp')?.scrollIntoView({ block: 'start' }));

    await expect(page.locator(`${SECTION} [data-testid="section-overline"]`)).toHaveText('Model Context Protocol');
    await expect(page.locator(`${SECTION} h2`)).toHaveText('Usa mi plataforma desde tu IA');
    const section = page.locator(`${SECTION} [data-testid="mcp-section"]`);
    await expect(section).toBeVisible({ timeout: 15_000 });

    // Conectar: una pestaña por cliente; solo Cursor tiene enlace de instalación.
    await expect(section.locator('[role="tablist"][aria-label="Cliente"] [role="tab"]')).toHaveText(['Claude Code', 'Claude Desktop', 'Cursor', 'VS Code']);
    await expect(section.locator('[data-testid="mcp-copy-text"]')).toContainText('claude mcp add --transport http portfolio https://api.example.com/v1/mcp');
    await section.locator('[role="tab"]', { hasText: 'Cursor' }).click();
    await expect(section.locator('[data-testid="mcp-install-link"]')).toHaveAttribute('href', /^cursor:\/\/anysphere\.cursor-deeplink\/mcp\/install\?name=portfolio&config=/);
    await section.locator('[role="tab"]', { hasText: 'VS Code' }).click();
    await expect(section.locator('[data-testid="mcp-install-link"]')).toHaveCount(0);
    await expect(section.locator('[data-testid="mcp-copy-text"]')).toContainText('"type": "http"');

    // Herramientas: las seis, sacadas de la grabación (no hay servidor en modo demo), con su clase.
    await expect(section.locator('[data-testid="mcp-recorded"]')).toHaveText('Grabación');
    await expect(section.locator('[data-testid="mcp-tools"] li')).toHaveCount(6);
    await expect(section.locator('[data-testid="mcp-tools"] .ui-badge', { hasText: 'Genera' })).toHaveCount(2);
    await expect(section.locator('[data-testid="mcp-tools"] .ui-badge', { hasText: 'Lectura' })).toHaveCount(4);
    await expect(section.locator('[data-testid="mcp-status"]')).toContainText('Grabación');
    await expect(section.locator('[data-testid="mcp-status"]')).not.toContainText('En línea');
    await expect(section.locator('[data-testid="mcp-activity"] li')).toHaveCount(3);

    // Evaluaciones, con su fecha.
    await expect(section.locator('[data-testid="mcp-eval"]')).toContainText(/\d+ de \d+ tareas resueltas/);
    await expect(section.locator('[data-testid="mcp-eval"] time')).toHaveAttribute('datetime', /^\d{4}-\d{2}-\d{2}T/);

    const scroll = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    expect(scroll.scroll, 'la página no se desplaza en horizontal').toBeLessThanOrEqual(scroll.client + 1);
    await capture(page, testInfo, 'hito-8-seccion');
  });

  test('«Probar sin instalar» reproduce la sesión grabada mensaje a mensaje', async ({ page }, testInfo) => {
    await open(page, { 'mcp.section': true });
    await page.evaluate(() => document.getElementById('mcp')?.scrollIntoView({ block: 'start' }));
    const section = page.locator(`${SECTION} [data-testid="mcp-section"]`);
    await expect(section).toBeVisible({ timeout: 15_000 });
    await expect(section.locator('[data-testid="mcp-replay-progress"]')).toContainText('0 de 11 mensajes');

    // A mano: cada pulsación enseña un mensaje.
    await section.getByRole('button', { name: 'Siguiente' }).click();
    await section.getByRole('button', { name: 'Siguiente' }).click();
    await expect(section.locator('[data-testid="mcp-replay"] > li')).toHaveCount(2);
    await expect(section.locator('[data-testid="mcp-replay"] > li').first()).toContainText('initialize');

    // Reproducir enseña el resto hasta el final.
    await section.getByRole('button', { name: 'Continuar' }).click();
    await expect(section.locator('[data-testid="mcp-replay"] > li')).toHaveCount(11, { timeout: 20_000 });
    await expect(section.locator('[data-testid="mcp-replay-progress"]')).toContainText('11 de 11 mensajes');
    await expect(section.locator('[data-testid="mcp-replay"]')).toContainText('tools/call · generar_terraform');
    const scroll = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    expect(scroll.scroll, 'la página no se desplaza en horizontal').toBeLessThanOrEqual(scroll.client + 1);
    await capture(page, testInfo, 'hito-8-reproduccion');
  });
});
