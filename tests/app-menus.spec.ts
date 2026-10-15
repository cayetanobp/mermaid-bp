import {test,expect,type Page} from '@playwright/test';
import {command} from './menu-helpers';
async function ready(page:Page){await page.goto('/');await expect(page.locator('#render-state')).toHaveText('Actualizado');}
test('una sola barra de menús deja sitio al lienzo y mantiene todos los comandos',async({page})=>{
 await ready(page);await expect(page.locator('[role="menubar"]')).toHaveCount(1);await expect(page.locator('#file-toolbar,.visual-toolbar,#toolbar-toggle')).toHaveCount(0);
 const header=await page.locator('.app-menubar').boundingBox(),canvas=await page.locator('#diagram-viewport').boundingBox();expect(header!.height).toBeLessThanOrEqual(44);expect(canvas!.y).toBe(header!.height);
 for(const label of ['Archivo','Edición','Ver','Diagrama','Configuración','Ayuda'])await expect(page.getByRole('menuitem',{name:label,exact:true})).toBeVisible();
 await page.locator('#menu-archivo').click();await expect(page.locator('#save')).toBeVisible();await expect(page.locator('#svg')).toBeVisible();await page.locator('#menu-diagrama').hover();await expect(page.locator('#add-node')).toBeVisible();await expect(page.locator('#save')).toBeHidden();await page.keyboard.press('Escape');
 const original=await page.locator('.cm-content').innerText();await command(page,'add-node');await page.locator('#node-label').fill('Nodo desde menú');await page.locator('#node-form button[type=submit]').click();await expect(page.locator('#render-state')).toHaveText('Actualizado');await expect(page.locator('#diagram [data-node-id]')).toHaveCount(5);
 await command(page,'undo');await expect(page.locator('#render-state')).toHaveText('Actualizado');await expect(page.locator('.cm-content')).toHaveText(original);
 const pending=page.waitForEvent('download');await command(page,'save');expect((await pending).suggestedFilename()).toBe('diagrama.mmd');
 for(const id of ['svg','png']){const pending=page.waitForEvent('download');await command(page,id);expect((await pending).suggestedFilename()).toMatch(new RegExp('\\.'+id+'$'));}
 await page.screenshot({path:'test-results/menu-editor-desktop.png'});
});
test('menús con teclado, cierre exterior, foco y atajo de guardado',async({page})=>{
 await ready(page);const source=await page.locator('.cm-content').innerText(),camera=await page.locator('#diagram-stage').getAttribute('style');
 await page.locator('#menu-archivo').focus();await page.keyboard.press('ArrowDown');await expect(page.locator('#new')).toBeFocused();await page.keyboard.press('End');await expect(page.locator('#png')).toBeFocused();await page.keyboard.press('ArrowRight');await expect(page.locator('#undo')).toBeFocused();await page.keyboard.press('Escape');await expect(page.locator('#menu-edicion')).toBeFocused();await expect(page.locator('#menu-edicion-panel')).toBeHidden();
 await page.locator('#menu-ver').click();await page.locator('#diagram-viewport').click({position:{x:15,y:15}});await expect(page.locator('#menu-ver-panel')).toBeHidden();expect(await page.locator('#diagram-stage').getAttribute('style')).toBe(camera);expect(await page.locator('.cm-content').innerText()).toBe(source);
 const download=page.waitForEvent('download');await page.keyboard.press('ControlOrMeta+s');expect((await download).suggestedFilename()).toBe('diagrama.mmd');
});
test('vistas, dirección, configuración y guía siguen disponibles',async({page})=>{
 await ready(page);await command(page,'view-cascade');await expect(page.locator('#cascade')).toBeVisible();await command(page,'view-code');await expect(page.locator('#editor')).toBeVisible();
 await page.locator('#menu-diagrama').click();await page.locator('#direction').selectOption('LR');await page.keyboard.press('Escape');await expect(page.locator('#render-state')).toHaveText('Actualizado');await expect(page.locator('.cm-content')).toContainText('flowchart LR');
 await command(page,'plugins-button');await expect(page.locator('#plugins-dialog')).toBeVisible();await page.locator('#plugins-close').click();
 await command(page,'tour-button');await expect(page.locator('#tour-dialog')).toBeVisible();for(let i=0;i<4;i++)await page.locator('#tour-next').click();await page.keyboard.press('Escape');await expect(page.locator('#tour-dialog')).toBeHidden();await expect(page.locator('[role="menu"]:visible')).toHaveCount(0);
});
test('pantalla completa conserva los menús y permite editar, salir y recuperar cámara',async({page})=>{
 await ready(page);const camera=await page.locator('#diagram-stage').getAttribute('style');await command(page,'diagram-fullscreen');await expect(page.locator('#app')).toHaveClass(/diagram-focus/);await expect(page.locator('.code-pane')).toBeHidden();await expect(page.locator('#menu-diagrama')).toBeVisible();await command(page,'add-node');await page.locator('#node-label').fill('Nodo ampliado');await page.locator('#node-form button[type=submit]').click();await expect(page.locator('#render-state')).toHaveText('Actualizado');await expect(page.locator('#diagram [data-node-id]')).toHaveCount(5);await page.locator('#diagram-exit-fullscreen').click();await expect(page.locator('.code-pane')).toBeVisible();await expect.poll(()=>page.locator('#diagram-stage').getAttribute('style')).toBe(camera);
});
test('menús ajustados a ventanas estrechas sin desbordar',async({page})=>{
 await page.setViewportSize({width:600,height:900});await ready(page);await page.locator('#menu-configuracion').click();const box=(await page.locator('#menu-configuracion-panel').boundingBox())!;expect(box.x+box.width).toBeLessThanOrEqual(600);await command(page,'plugins-button');await page.locator('#plugins-close').click();await page.screenshot({path:'test-results/menu-editor-600.png',fullPage:true});
 await page.setViewportSize({width:360,height:800});await page.locator('#menu-ayuda').click();const help=(await page.locator('#menu-ayuda-panel').boundingBox())!;expect(help.x).toBeGreaterThanOrEqual(0);expect(help.x+help.width).toBeLessThanOrEqual(360);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
