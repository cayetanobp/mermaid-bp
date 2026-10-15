async function action(page:any,id:string){const button=page.locator('#'+id);if(!await button.isVisible()){const trigger=await button.evaluate((el:Element)=>el.closest('[role="menu"]')?.getAttribute('aria-labelledby'));if(trigger)await page.locator('#'+trigger).click();}await button.click();}
import {test,expect} from '@playwright/test';
test('arranque local conserva borrador, historial y edición',async({page})=>{
 await page.goto('/');await expect(page.locator('#render-state')).toHaveText('Actualizado');
 const editor=page.getByRole('textbox',{name:'Código Mermaid'});await editor.click();await editor.press('ControlOrMeta+a');await page.keyboard.insertText('flowchart LR\nA["Borrador local"]-->B["Fin"]');await expect(page.locator('#render-state')).toHaveText('Actualizado');
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('mermaid-bp:draft:v1')!).source)).toContain('Borrador local');await page.reload();await expect(page.locator('#render-state')).toHaveText('Actualizado');await expect(page.locator('#diagram')).toContainText('Borrador local');
 await page.locator('#tab-cascade').click();await page.locator('[data-cascade-node="A"]').click();await page.locator('#selection').getByRole('button',{name:'Editar',exact:true}).click();await page.locator('#node-label').fill('Edición local');await page.locator('#node-form button[type=submit]').click();await expect(page.locator('#diagram')).toContainText('Edición local');
 await action(page,'undo');await expect(page.locator('#diagram')).toContainText('Borrador local');
});
