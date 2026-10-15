import {command} from './menu-helpers';
import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const ready = (p: Page) => expect(p.locator('#render-state')).toHaveText('Actualizado');
async function code(p: Page, text: string) {
  const e = p.getByRole('textbox', { name: 'Código Mermaid' }); await e.click(); await e.press('ControlOrMeta+a');
  await p.keyboard.insertText(text); await ready(p);
}
async function centers(p: Page) {
  return p.locator('#diagram svg').evaluate((root: SVGSVGElement) => Object.fromEntries([...root.querySelectorAll<SVGGElement>('[data-node-id]')].map(n => {
    const b = n.getBBox(), m = root.getCTM()!.inverse().multiply(n.getCTM()!);
    const v = new DOMPoint(b.x + b.width / 2, b.y + b.height / 2).matrixTransform(m);
    return [n.dataset.nodeId!, { x: Math.round(v.x * 1e6) / 1e6, y: Math.round(v.y * 1e6) / 1e6 }];
  })));
}
async function begin(p: Page, id: string, dx = 90, dy = -30) {
  const b = (await p.locator('[data-node-id="' + id + '"]').boundingBox())!;
  await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await p.mouse.down();
  await p.mouse.move(b.x + b.width / 2 + dx, b.y + b.height / 2 + dy, { steps: 10 });
}
async function observe(p: Page) {
  await p.evaluate(() => {
    (window as any).renders = 0;
    new MutationObserver(changes => changes.forEach(c => c.addedNodes.forEach(n => {
      if (n instanceof Element && n.classList.contains('render-host')) (window as any).renders++;
    }))).observe(document.body, { childList: true });
  });
}
test.beforeEach(async ({ page }) => {
  page.on('dialog', d => d.accept()); await page.goto('/'); await ready(page);
  await code(page, 'flowchart TD\nA["inicio"] --> B["segundo"]\nB -->|sí| C["tercero"]');
});
test('arrastre inmediato, sin renders ni movimientos de otros nodos y sin salto al soltar', async ({ page }) => {
  const before = await centers(page), source = await page.locator('.cm-content').innerText();
  const camera = await page.locator('#diagram-stage').getAttribute('style'); await observe(page);
  await begin(page, 'C');
  await expect.poll(async () => (await centers(page)).C.x).not.toBe(before.C.x);
  const shown = await centers(page), paths = await page.locator('.edgePaths path').evaluateAll(es => es.map(e => e.getAttribute('d')));
  expect(shown.A).toEqual(before.A); expect(shown.B).toEqual(before.B);
  expect(await page.locator('.cm-content').innerText()).toBe(source);
  await page.mouse.up(); await ready(page);
  expect(await centers(page)).toEqual(shown);
  expect(await page.locator('.edgePaths path').evaluateAll(es => es.map(e => e.getAttribute('d')))).toEqual(paths);
  expect(await page.locator('#diagram-stage').getAttribute('style')).toBe(camera);
  await page.waitForTimeout(600); expect(await page.evaluate(() => (window as any).renders)).toBe(0);
  expect(await page.locator('.cm-content').innerText()).toContain('%% graph:positions ');
  await page.screenshot({ path: 'test-results/manual-position.png' });
});
test('las posiciones sobreviven recarga, una edición de texto y un segundo movimiento', async ({ page }) => {
  await begin(page, 'C'); await page.mouse.up(); await ready(page);
  const placed = await centers(page);
  await page.reload(); await ready(page);
  let after = await centers(page);
  for (const id of Object.keys(placed)) {
    expect(after[id].x).toBeCloseTo(placed[id].x, 2); expect(after[id].y).toBeCloseTo(placed[id].y, 2);
  }
  const text = await page.locator('.cm-content').innerText();
  await code(page, text.replace('segundo', 'segundo actualizado'));
  after = await centers(page);
  for (const id of Object.keys(placed)) {
    expect(after[id].x).toBeCloseTo(placed[id].x, 2); expect(after[id].y).toBeCloseTo(placed[id].y, 2);
  }
  await begin(page, 'C', -20, 40); await page.mouse.up(); await ready(page);
  const twice = await centers(page);
  await page.reload(); await ready(page); after = await centers(page);
  for (const id of Object.keys(twice)) {
    expect(after[id].x).toBeCloseTo(twice[id].x, 2); expect(after[id].y).toBeCloseTo(twice[id].y, 2);
  }
});
test('Escape cancela y deshacer/rehacer recupera las posiciones', async ({ page }) => {
  const before = await centers(page), text = await page.locator('.cm-content').innerText();
  await begin(page, 'C'); await page.keyboard.press('Escape'); await page.mouse.up();
  expect(await centers(page)).toEqual(before); expect(await page.locator('.cm-content').innerText()).toBe(text);
  await begin(page, 'C'); await page.mouse.up(); const placed = await centers(page);
  await command(page,'undo'); await ready(page); expect(await centers(page)).toEqual(before);
  await command(page,'redo'); await ready(page);
  const after = await centers(page);
  expect(after.C.x).toBeCloseTo(placed.C.x, 2); expect(after.C.y).toBeCloseTo(placed.C.y, 2);
});
test('el zoom se conserva y mover fuera del borde no produce salto al soltar', async ({ page }) => {
  const b = (await page.locator('#diagram-viewport').boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.wheel(0, -70);
  const zoom = await page.locator('#diagram-stage').evaluate(el => new DOMMatrix(getComputedStyle(el).transform).a);
  await begin(page, 'A', -170, -80);
  const before = (await page.locator('[data-node-id="A"]').boundingBox())!;
  await page.mouse.up(); await ready(page);
  const after = (await page.locator('[data-node-id="A"]').boundingBox())!;
  expect(after.x).toBeCloseTo(before.x, 2); expect(after.y).toBeCloseTo(before.y, 2);
  expect(await page.locator('#diagram-stage').evaluate(el => new DOMMatrix(getComputedStyle(el).transform).a)).toBe(zoom);
});
