import {command} from './menu-helpers';
import {test,expect} from '@playwright/test';
const ready=async(page:any)=>{await page.goto('/');await expect(page.locator('#render-state')).toHaveText('Actualizado');};
test('inspector cambia de altura por arrastre y teclado sin modificar documento ni cámara',async({page})=>{
 await ready(page);await page.locator('#tab-cascade').click();await page.locator('[data-cascade-node]').first().click();
 const source=await page.evaluate(()=>localStorage.getItem('mermaid-bp:draft:v1')),camera=await page.locator('#diagram-stage').getAttribute('style');
 const panel=page.locator('#inspector'),before=(await panel.boundingBox())!.height,handle=page.locator('#inspector-resizer'),box=(await handle.boundingBox())!;
 const cascade=(await page.locator('#cascade').boundingBox())!.height;
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2,box.y+box.height/2-65,{steps:8});await page.mouse.up();
 expect((await panel.boundingBox())!.height).toBeGreaterThan(before+50);expect((await page.locator('#cascade').boundingBox())!.height).toBeLessThan(cascade-50);
 await handle.focus();await page.keyboard.press('ArrowDown');expect((await panel.boundingBox())!.height).toBeGreaterThan(before+25);
 expect(await page.locator('#diagram-stage').getAttribute('style')).toBe(camera);expect(await page.evaluate(()=>localStorage.getItem('mermaid-bp:draft:v1'))).toBe(source);
 await page.locator('#tab-code').click();await expect(page.locator('#editor')).toBeVisible();await page.locator('#inspector-close').click();await expect(panel).toBeHidden();
});
for(const reducedMotion of ['no-preference','reduce'] as const)test(`ir a centra sin cambiar zoom; movimiento ${reducedMotion}`,async({page})=>{
 await page.emulateMedia({reducedMotion});await ready(page);await page.locator('#tab-cascade').click();const row=page.locator('[data-cascade-node]').last(),id=await row.getAttribute('data-cascade-node');await row.click();
 const vp=page.locator('#diagram-viewport');await vp.hover();await page.mouse.wheel(0,-180);
 const scale=()=>page.locator('#diagram-stage').evaluate(el=>new DOMMatrix(getComputedStyle(el).transform).a);const zoom=await scale();
 await page.locator('#locate-node').click();expect(await scale()).toBe(zoom);
 const node=await page.locator(`[data-node-id="${id}"]`).boundingBox(),canvas=await vp.boundingBox();expect(Math.abs(node!.x+node!.width/2-canvas!.x-canvas!.width/2)).toBeLessThan(2);expect(Math.abs(node!.y+node!.height/2-canvas!.y-canvas!.height/2)).toBeLessThan(2);
 await expect(page.locator('[data-editor-overlay]')).toHaveCount(1);if(reducedMotion==='reduce')expect(await page.locator('.node-location').evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
 const download=page.waitForEvent('download');await command(page,'svg');const file=await download;const stream=await file.createReadStream();let text='';for await(const chunk of stream!)text+=chunk.toString();expect(text).not.toContain('data-editor-overlay');
});
test('BookStack se desactiva y reactiva; guía adapta pasos y conserva documento',async({page,context})=>{
 await ready(page);await expect(page.locator('#plugin-bookstack-preview')).toHaveCount(1);const source=await page.evaluate(()=>localStorage.getItem('mermaid-bp:draft:v1'));
 await command(page,'plugins-button');await page.getByRole('checkbox',{name:'Activar BookStack'}).uncheck();await expect(page.locator('#plugin-bookstack-preview')).toHaveCount(0);await page.locator('#plugins-close').click();
 const check=await context.newPage();await check.goto('/bookstack.html');await expect(check.locator('#check-state')).toContainText('desactivado');await expect(check.locator('#check-output svg')).toHaveCount(0);await check.close();
 await command(page,'tour-button');await expect(page.locator('#tour-progress')).toHaveText('Paso 1 de 5');await page.locator('#tour-next').click();await expect(page.locator('#tab-cascade')).toHaveAttribute('aria-selected','true');await page.keyboard.press('Escape');await expect(page.locator('#tab-code')).toHaveAttribute('aria-selected','true');
 await page.reload();await expect(page.locator('#render-state')).toHaveText('Actualizado');await expect(page.locator('#plugin-bookstack-preview')).toHaveCount(0);await command(page,'plugins-button');await page.getByRole('checkbox',{name:'Activar BookStack'}).check();await expect(page.locator('#plugin-bookstack-preview')).toHaveCount(1);await page.locator('#plugins-close').click();
 await command(page,'tour-button');await expect(page.locator('#tour-progress')).toHaveText('Paso 1 de 6');for(let n=0;n<4;n++)await page.locator('#tour-next').click();await expect(page.locator('#tour-title')).toHaveText('Vista previa de BookStack');await page.locator('#tour-next').click();await page.locator('#tour-next').click();await expect(page.locator('#tour-dialog')).not.toBeVisible();expect(await page.evaluate(()=>localStorage.getItem('mermaid-bp:draft:v1'))).toBe(source);
 await page.screenshot({path:'test-results/editor-institucional.png'});
});
