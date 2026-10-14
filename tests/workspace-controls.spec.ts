import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const ready = (page: Page) => expect(page.locator('#render-state')).toHaveText('Actualizado');
const camera = (page: Page) => page.locator('#diagram-stage').getAttribute('style');
test.beforeEach(async ({page}) => { page.on('dialog', d => d.accept()); await page.goto('/'); await ready(page); });
test('plegar herramientas gana espacio, conserva el documento y recuerda la preferencia', async ({page}) => {
  const original = await page.locator('.cm-content').innerText();
  const before = (await page.locator('#diagram-viewport').boundingBox())!;
  const originalCamera = await camera(page);
  await page.getByRole('button', {name:'Ocultar herramientas',exact:true}).click();
  await expect(page.locator('#file-toolbar')).toBeHidden();
  await expect(page.locator('#toolbar-toggle')).toHaveAttribute('aria-expanded','false');
  const after = (await page.locator('#diagram-viewport').boundingBox())!;
  expect(after.height-before.height).toBeGreaterThanOrEqual(50);
  expect(await camera(page)).toBe(originalCamera);
  expect(await page.locator('.cm-content').innerText()).toBe(original);
  const pending = page.waitForEvent('download'); await page.keyboard.press('ControlOrMeta+s');
  expect((await pending).suggestedFilename()).toBe('diagrama.mmd');
  await page.reload(); await ready(page);
  await expect(page.locator('#file-toolbar')).toBeHidden();
  await page.screenshot({path:'test-results/barra-plegada.png'});
  await page.getByRole('button', {name:'Mostrar herramientas',exact:true}).click();
  await expect(page.locator('#file-toolbar')).toBeVisible();
  await expect(page.locator('#toolbar-toggle')).toHaveAttribute('aria-expanded','true');
});
test('pantalla completa amplía el lienzo y permite editar y salir sin perder el encuadre', async ({page}) => {
  const normalBox = (await page.locator('#diagram-viewport').boundingBox())!;
  const beforeCamera = await camera(page);
  await page.getByRole('button',{name:'Pantalla completa',exact:true}).click();
  await expect(page.locator('#app')).toHaveClass(/diagram-focus/);
  await expect(page.locator('.code-pane')).toBeHidden(); await expect(page.locator('.topbar')).toBeHidden();
  await expect(page.locator('#diagram-fullscreen')).toHaveAttribute('aria-pressed','true');
  const fullscreenBox = (await page.locator('#diagram-viewport').boundingBox())!;
  expect(fullscreenBox.width).toBeGreaterThan(normalBox.width+300);
  expect(fullscreenBox.height).toBeGreaterThan(normalBox.height);
  expect(await page.evaluate(()=>document.fullscreenElement?.id)).toBe('app');
  await page.locator('#add-node').click(); await expect(page.locator('#node-dialog')).toBeVisible();
  await page.locator('#node-label').fill('Editar en pantalla completa');
  await page.locator('#node-form button[type=submit]').click(); await ready(page);
  await expect(page.locator('#diagram [data-node-id]')).toHaveCount(5);
  await page.keyboard.press('Escape');
  await expect(page.locator('#app')).not.toHaveClass(/diagram-focus/);
  await expect(page.locator('.code-pane')).toBeVisible();
  await expect.poll(()=>camera(page)).toBe(beforeCamera);
  await expect(page.locator('.cm-content')).toContainText('Editar en pantalla completa');
  await expect(page.locator('#file-toolbar')).toBeVisible();
});
test('Esc cierra el diálogo antes de salir del diagrama y respeta la barra plegada', async ({page}) => {
  await page.locator('#toolbar-toggle').click();
  await page.locator('#diagram-fullscreen').click();
  await page.locator('#add-node').click();
  await page.keyboard.press('Escape'); await expect(page.locator('#node-dialog')).toBeHidden();
  // El navegador puede abandonar su modo nativo con Esc, pero no se pierde el documento.
  if (await page.locator('#app').evaluate(el=>el.classList.contains('diagram-focus'))) {
    await page.getByRole('button',{name:'Salir de pantalla completa',exact:true}).click();
  }
  await expect(page.locator('#app')).not.toHaveClass(/diagram-focus/);
  await expect(page.locator('#file-toolbar')).toBeHidden();
  await expect(page.locator('#toolbar-toggle')).toHaveAttribute('aria-expanded','false');
  await expect(page.locator('#diagram [data-node-id]')).toHaveCount(4);
});
test('el modo ampliado funciona cuando el navegador bloquea la API de pantalla completa', async ({page}) => {
  await page.evaluate(()=>{ document.getElementById('app')!.requestFullscreen=()=>Promise.reject(new DOMException('Bloqueado','NotAllowedError')); });
  await page.locator('#diagram-fullscreen').click();
  await expect(page.locator('#app')).toHaveClass(/diagram-focus/);
  await expect(page.locator('.code-pane')).toBeHidden();
  await page.getByRole('button',{name:'Salir de pantalla completa',exact:true}).click();
  await expect(page.locator('#app')).not.toHaveClass(/diagram-focus/);
  await expect(page.locator('.code-pane')).toBeVisible();
});
