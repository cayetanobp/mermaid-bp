import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {command} from './menu-helpers';
const ready=(page:any)=>expect(page.locator('#render-state')).toHaveText('Actualizado');
test.beforeEach(async({page})=>{page.on('dialog',d=>d.accept());await page.goto('/');await ready(page);});
test('el botón superpuesto amplía el diagrama sin llamar a la API de pantalla completa',async({page})=>{
 await page.evaluate(()=>{document.getElementById('app')!.requestFullscreen=()=>{throw Error('No debe llamarse');};});
 const button=page.locator('#diagram-fullscreen');await expect(button).toBeVisible();await expect(page.locator('#menu-ver-panel #diagram-fullscreen')).toHaveCount(0);
 const canvas=(await page.locator('#diagram-viewport').boundingBox())!,box=(await button.boundingBox())!;expect(canvas.x+canvas.width-box.x-box.width).toBeLessThan(15);expect(box.y-canvas.y).toBeLessThan(15);
 await button.click();await expect(page.locator('#app')).toHaveClass(/diagram-focus/);expect(await page.evaluate(()=>document.fullscreenElement===null)).toBe(true);await expect(page.locator('#fullscreen-diagram-tools')).toBeVisible();await button.click();await expect(page.locator('.code-pane')).toBeVisible();await button.click();await page.keyboard.press('Escape');await expect(page.locator('.code-pane')).toBeVisible();
});
test('doble clic en una relación abre su edición y un solo clic muestra información',async({page})=>{
 const input=page.getByRole('textbox',{name:'Código Mermaid'});await input.click();await input.press('ControlOrMeta+a');await page.keyboard.insertText('flowchart LR\nA["Origen"] -->|Relación existente| B["Destino"]');await ready(page);
 const label=page.locator('[data-edge-label="0"]');await label.click();await expect(page.locator('#edge-dialog')).toBeHidden();await expect(page.locator('.bend-handle')).toHaveCount(2);await page.waitForTimeout(500);await label.dblclick();await expect(page.locator('#edge-dialog')).toBeVisible();await expect(page.locator('#edge-label')).toHaveValue('Relación existente');await page.locator('#edge-label').fill('Editada');await page.locator('#edge-form button[type=submit]').click();await ready(page);await expect(page.locator('.cm-content')).toContainText('Editada');
});
test('las relaciones antiguas tienen extremos y tiradores utilizables sin restablecer',async({page})=>{
 const source=await readFile(new URL('./fixtures/large-workflow-positioned.mmd',import.meta.url),'utf8');await command(page,'save');await page.locator('#file').setInputFiles({name:'antiguo.mmd',mimeType:'text/plain',buffer:Buffer.from(source)});await ready(page);
 for(const index of [0,9,14,20]){
  await page.locator(`path.flowchart-link[data-edge-index="${index}"]`).first().dispatchEvent('pointerdown',{button:0,pointerId:90});
  await expect(page.locator('.bend-handle')).toHaveCount(2);await expect(page.locator('.port-handle')).toHaveCount(2);
  for(const selector of ['[data-port-end="from"]','[data-port-end="to"]','[data-bend-end="from"]','[data-bend-end="to"]']){
   const handle=page.locator(selector),box=(await handle.boundingBox())!,before=await page.locator(`path.flowchart-link[data-edge-index="${index}"]`).first().getAttribute('d');
   expect(await handle.evaluate(el=>{const r=el.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===el;}),`tirador ${selector} en relación ${index}`).toBe(true);
   await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+12,box.y+box.height/2+8,{steps:6});await page.mouse.up();await ready(page);expect(await page.locator(`path.flowchart-link[data-edge-index="${index}"]`).first().getAttribute('d')).not.toBe(before);
  }
 }
 const pending=page.waitForEvent('download');await command(page,'save');const stream=await(await pending).createReadStream();let saved='';for await(const chunk of stream!)saved+=chunk.toString();expect(saved).toContain('"bendFrom"');expect(saved).toContain('"bendTo"');
});
