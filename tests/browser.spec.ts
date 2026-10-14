import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
async function ready(page: Page) { await expect(page.locator('#render-state')).toHaveText('Actualizado'); }
async function code(page: Page, text: string) {
  const editor = page.getByRole('textbox', { name: 'Código Mermaid' });
  await editor.click(); await editor.press('ControlOrMeta+a'); await page.keyboard.insertText(text); await ready(page);
}
async function text(page: Page) { return page.locator('.cm-content').innerText(); }
async function downloadText(page: Page) {
  const pending = page.waitForEvent('download'); await page.locator('#save').click();
  const file = await pending; return readFile((await file.path())!, 'utf8');
}
test.beforeEach(async ({ page }) => { page.on('dialog', dialog => dialog.accept()); await page.goto('/'); await ready(page); });
test('arranque sin errores y sin peticiones externas', async ({ page }) => {
  const external: string[] = [], errors: string[] = [];
  page.on('request', r => { if (!r.url().startsWith('http://127.0.0.1:4177/')) external.push(r.url()); });
  page.on('pageerror', e => errors.push(e.message));
  await page.reload(); await ready(page);
  await expect(page.locator('#diagram g.node')).toHaveCount(4);
  expect(external).toEqual([]); expect(errors).toEqual([]);
  await page.screenshot({ path: 'test-results/editor-desktop.png', fullPage: true });
});
test('crear, editar y eliminar un nodo con historial', async ({ page }) => {
  await page.locator('#add-node').click();
  await page.locator('#node-label').fill('Revisión "manual" & final');
  await page.locator('#node-shape').selectOption('diamond');
  await page.locator('#node-form button[type=submit]').click(); await ready(page);
  await expect(page.locator('#diagram g.node')).toHaveCount(5);
  await page.locator('[data-node-id="N1"]').dblclick();
  await page.locator('#node-label').fill('Texto actualizado'); await page.locator('#node-form button[type=submit]').click(); await ready(page);
  await expect(page.locator('[data-node-id="N1"]')).toContainText('Texto actualizado');
  await page.locator('[data-node-id="N1"]').click(); await page.locator('#selection .danger').click(); await ready(page);
  await expect(page.locator('#diagram g.node')).toHaveCount(4);
  await page.locator('#undo').click(); await ready(page);
  await expect(page.locator('#diagram g.node')).toHaveCount(5);
});
test('crear una conexión, seleccionarla y eliminarla', async ({ page }) => {
  await code(page, 'flowchart LR\nA["uno"]\nB["dos"]');
  await page.locator('#add-edge').click(); await page.locator('#edge-label').fill('sí | quizá');
  await page.locator('#edge-form button[type=submit]').click(); await ready(page);
  await expect(page.locator('[data-edge-index]')).toHaveCount(1);
  expect(await text(page)).toContain('#124;');
  const edge = page.locator('[data-edge-index="0"]');
  await edge.evaluate(el => el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 })));
  await expect(page.locator('#selection')).toBeVisible();
  await page.locator('#selection .danger').click(); await ready(page);
  await expect(page.locator('[data-edge-index]')).toHaveCount(0);
});
test('errores conservan la vista anterior y bloquean cambios visuales', async ({ page }) => {
  const old = await page.locator('#diagram').innerHTML();
  const input = page.getByRole('textbox', { name: 'Código Mermaid' });
  await input.click(); await input.press('ControlOrMeta+a'); await page.keyboard.insertText('flowchart TD\nA["incompleto');
  await expect(page.locator('#error')).toBeVisible();
  await expect(page.locator('#render-state')).toContainText('Vista anterior');
  expect(await page.locator('#diagram').innerHTML()).toBe(old);
  await expect(page.locator('#add-node')).toBeDisabled(); await expect(page.locator('#svg')).toBeDisabled();
  await code(page, 'flowchart LR\nA --> B'); await expect(page.locator('#error')).toBeHidden();
});
test('otros tipos y estilos avanzados conservan código sin edición visual', async ({ page }) => {
  const diagram = 'sequenceDiagram\n    Alice->>Bob: hola';
  await code(page, diagram); await expect(page.locator('#add-node')).toBeDisabled();
  expect(await downloadText(page)).toBe(diagram);
  await code(page, 'flowchart TD\nA --> B\nclassDef rojo fill:#fcc\nclass A rojo');
  await expect(page.locator('#add-node')).toBeDisabled();
  await expect(page.locator('#diagram svg')).toBeVisible();
});
test('abrir, descargar, recuperar borrador y cancelar sustitución', async ({ page }) => {
  await page.locator('#save').click();
  const original = 'flowchart LR\n    A["áéíóú ñ"] --> B["final"]\n';
  await page.locator('#file').setInputFiles({ name: 'prueba.mmd', mimeType: 'text/plain', buffer: Buffer.from(original) }); await ready(page);
  await expect(page.locator('#filename')).toHaveText('prueba.mmd');
  expect(await downloadText(page)).toBe(original);
  await code(page, 'flowchart TD\nA["borrador"]');
  await page.reload(); await ready(page); expect(await text(page)).toContain('borrador');
  await page.locator('#new').click(); await expect(page.locator('#confirm-dialog')).toBeVisible();
  await page.locator('#confirm-dialog button[value=cancel]').click(); expect(await text(page)).toContain('borrador');
  await page.locator('#new').click(); await page.locator('#confirm-dialog button[value=replace]').click(); await ready(page);
  await page.locator('#add-node').click(); await page.locator('#node-label').fill('Primer nodo');
  await page.locator('#node-form button[type=submit]').click(); await ready(page);
  await expect(page.locator('#diagram g.node')).toHaveCount(1);
  await page.locator('#undo').click(); await ready(page);
  expect(await text(page)).not.toContain('borrador');
});
test('exporta SVG limpio y PNG válido', async ({ page }) => {
  await page.locator('[data-node-id="Inicio"]').click();
  for (const format of ['svg', 'png']) {
    const pending = page.waitForEvent('download'); await page.locator(`#${format}`).click();
    const file = await pending, bytes = await readFile((await file.path())!);
    expect(file.suggestedFilename()).toBe(`diagrama.${format}`);
    if (format === 'svg') { expect(bytes.toString()).toContain('<svg'); expect(bytes.toString()).not.toContain('selection-ring'); }
    else { expect(bytes.subarray(1, 4).toString()).toBe('PNG'); expect(bytes.length).toBeGreaterThan(1000); }
  }
});
test('copiar para BookStack genera un bloque Markdown', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.locator('#copy').click();
  const clipboard = (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n');
  expect(clipboard.startsWith('```mermaid\nflowchart TD')).toBe(true); expect(clipboard.endsWith('\n```')).toBe(true);
});
test('la distribución coincide con la integración de BookStack en tres flujos', async ({ page, context }) => {
  const samples = [
    'flowchart TD\nA["inicio"] --> B{"¿listo?"}\nB -->|"sí"| C["fin"]\nB -->|"no"| A',
    'flowchart LR\nA --> B\nA --> C\nB --> D\nC --> D\n%% mbp-layout:start\nB ~~~ C\n%% mbp-layout:end',
    'flowchart TD\nInicio(["inicio"])\nA["trabajo"]\nB(("fin"))\nInicio ---> A\nA --> B\nSolo["nodo aislado"]',
  ];
  for (const sample of samples) {
    await code(page, sample);
    const first = await page.locator('#diagram svg').evaluate(svg => svg.getAttribute('viewBox'));
    const coordinates = await page.locator('#diagram g.node').evaluateAll(nodes => nodes.map(n => ({ id: n.id.replace(/-\d+$/, ''), transform: n.getAttribute('transform'), text: n.textContent })).sort((a, b) => a.id.localeCompare(b.id)));
    const check = await context.newPage(); await check.goto('/bookstack.html');
    await expect(check.locator('#check-state')).toContainText('Renderizado con');
    expect(await check.locator('#check-output svg').getAttribute('viewBox')).toBe(first);
    const compared = await check.locator('#check-output g.node').evaluateAll(nodes => nodes.map(n => ({ id: n.id.replace(/-\d+$/, ''), transform: n.getAttribute('transform'), text: n.textContent })).sort((a, b) => a.id.localeCompare(b.id)));
    expect(compared).toEqual(coordinates); await check.close();
  }
});
test('el arrastre ajusta un flujo y mantiene sus conexiones', async ({ page }) => {
  await code(page, 'flowchart TD\nA["inicio"] --> B["segundo"]\nB --> C["tercero"]');
  const before = await text(page);
  const box = (await page.locator('[data-node-id="C"]').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down(); await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 160, { steps: 12 }); await page.mouse.up();
  await expect(page.locator('#message')).toContainText(/Distribución ajustada|no ha encontrado/, { timeout: 30_000 }); await ready(page);
  const after = await text(page);
  expect(after).toMatch(/A -+> B/); expect(after).toMatch(/B -+> C/);
  expect(after).not.toBe(before);
  await page.locator('#undo').click(); await ready(page); expect(await text(page)).toBe(before);
});
test('un arrastre imposible no cambia un nodo aislado', async ({ page }) => {
  await code(page, 'flowchart TD\nA["solo"]'); const before = await text(page);
  const box = (await page.locator('[data-node-id="A"]').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2 + 40, { steps: 5 }); await page.mouse.up();
  await expect(page.locator('#message')).toContainText('no ha encontrado'); expect(await text(page)).toBe(before);
});
test('las respuestas antiguas no sustituyen código reciente y se ve en pantalla estrecha', async ({ page }) => {
  const editor = page.getByRole('textbox', { name: 'Código Mermaid' });
  await editor.click(); await editor.press('ControlOrMeta+a'); await page.keyboard.insertText('flowchart TD\nA --> B');
  await editor.press('ControlOrMeta+a'); await page.keyboard.insertText('flowchart LR\nUltimo["último"]'); await ready(page);
  await expect(page.locator('#diagram g.node')).toHaveCount(1);
  await expect(page.locator('#diagram')).toContainText('último');
  await page.setViewportSize({ width: 600, height: 900 });
  await expect(page.locator('#diagram svg')).toBeVisible();
  await page.screenshot({ path: 'test-results/editor-estrecho.png', fullPage: true });
});
