import {test,expect,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {command} from './menu-helpers';
const ready=(page:Page)=>expect(page.locator('#render-state')).toHaveText('Actualizado');
const camera=(page:Page)=>page.locator('#diagram-stage').getAttribute('style');
test.beforeEach(async({page})=>{page.on('dialog',dialog=>dialog.accept());await page.goto('/');await ready(page);});
test('menús sustituyen las barras apiladas y los atajos siguen funcionando',async({page})=>{
 const original=await page.locator('.cm-content').innerText(),before=await camera(page);await expect(page.locator('#file-toolbar,.visual-toolbar,#toolbar-toggle')).toHaveCount(0);
 await page.locator('#menu-archivo').click();await expect(page.locator('#save')).toBeVisible();await page.keyboard.press('Escape');expect(await camera(page)).toBe(before);expect(await page.locator('.cm-content').innerText()).toBe(original);
 const pending=page.waitForEvent('download');await page.keyboard.press('ControlOrMeta+s');expect((await pending).suggestedFilename()).toBe('diagrama.mmd');await page.reload();await ready(page);await expect(page.locator('#menu-archivo')).toBeVisible();
});
test('pantalla completa amplía el lienzo y permite editar y salir sin perder el encuadre',async({page})=>{
 const normalBox=(await page.locator('#diagram-viewport').boundingBox())!,beforeCamera=await camera(page);await command(page,'diagram-fullscreen');await expect(page.locator('#app')).toHaveClass(/diagram-focus/);await expect(page.locator('.code-pane')).toBeHidden();await expect(page.locator('.app-menubar')).toBeVisible();await expect(page.locator('#diagram-fullscreen')).toHaveAttribute('aria-pressed','true');
 const fullscreenBox=(await page.locator('#diagram-viewport').boundingBox())!;expect(fullscreenBox.width).toBeGreaterThan(normalBox.width+300);expect(fullscreenBox.height).toBeGreaterThanOrEqual(normalBox.height);expect(await page.evaluate(()=>document.fullscreenElement)).toBeNull();
 await command(page,'add-node');await expect(page.locator('#node-dialog')).toBeVisible();await page.locator('#node-label').fill('Editar en pantalla completa');await page.locator('#node-form button[type=submit]').click();await ready(page);await expect(page.locator('#diagram [data-node-id]')).toHaveCount(5);await page.locator('#diagram-exit-fullscreen').click();await expect(page.locator('.code-pane')).toBeVisible();await expect.poll(()=>camera(page)).toBe(beforeCamera);await expect(page.locator('.cm-content')).toContainText('Editar en pantalla completa');
});
test('Esc cierra el editor antes de salir del modo ampliado',async({page})=>{
 await command(page,'diagram-fullscreen');await command(page,'add-node');await page.keyboard.press('Escape');await expect(page.locator('#node-dialog')).toBeHidden();if(await page.locator('#app').evaluate(el=>el.classList.contains('diagram-focus')))await page.locator('#diagram-exit-fullscreen').click();await expect(page.locator('#app')).not.toHaveClass(/diagram-focus/);await expect(page.locator('#diagram [data-node-id]')).toHaveCount(4);
});
test('el modo ampliado funciona cuando el navegador bloquea la API de pantalla completa',async({page})=>{
 await page.evaluate(()=>{document.getElementById('app')!.requestFullscreen=()=>Promise.reject(new DOMException('Bloqueado','NotAllowedError'));});await command(page,'diagram-fullscreen');await expect(page.locator('#app')).toHaveClass(/diagram-focus/);await expect(page.locator('.code-pane')).toBeHidden();await page.locator('#diagram-exit-fullscreen').click();await expect(page.locator('.code-pane')).toBeVisible();
});
