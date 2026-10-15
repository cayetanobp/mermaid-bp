import {command} from './menu-helpers';
import {test,expect} from '@playwright/test';
test('compilación sin extensiones permite editar, navegar y exportar sin BookStack',async({page})=>{
 test.skip(process.env.MERMAID_BP_PLUGINS!=='none','Prueba de distribución sin extensiones.');
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');await expect(page.locator('#render-state')).toHaveText('Actualizado');await expect(page.locator('#plugin-actions')).toBeEmpty();
 await command(page,'plugins-button');await expect(page.locator('#plugin-list')).toContainText('no incluye extensiones');await page.locator('#plugins-close').click();
 const editor=page.getByRole('textbox',{name:'Código Mermaid'});await editor.click();await editor.press('ControlOrMeta+a');await page.keyboard.insertText('flowchart LR\nA["Expediente"] --> B["Resolución"]');await expect(page.locator('#diagram g.node')).toHaveCount(2);await expect(page.locator('#render-state')).toHaveText('Actualizado');
 await page.locator('#tab-cascade').click();await page.locator('[data-cascade-node="B"]').click();await page.locator('#locate-node').click();await expect(page.locator('[data-editor-overlay]')).toHaveCount(1);
 const download=page.waitForEvent('download');await command(page,'svg');expect((await download).suggestedFilename()).toMatch(/\.svg$/);
 await command(page,'tour-button');await expect(page.locator('#tour-progress')).toHaveText('Paso 1 de 5');await page.keyboard.press('Escape');expect(errors).toEqual([]);await page.screenshot({path:'test-results/core-sin-extensiones.png'});
});
