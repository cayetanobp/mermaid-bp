import {command} from './menu-helpers';
import {test,expect,type Page} from '@playwright/test';
const ready=(p:Page)=>expect(p.locator('#render-state')).toHaveText('Actualizado');
test('recolocar todo recupera un diagrama perdido, encaja todos los nodos y permite deshacer',async({page})=>{
 page.on('dialog',d=>d.accept());await page.goto('/');await ready(page);await command(page,'save');
 const source='%% mermaid-bp:manual-layout\nflowchart LR\nsubgraph G[Grupo]\nA[Uno] --> B[Dos]\nend\nC[Tres]\nstyle G fill:#ffffdd\n%% graph:positions {"A":{"x":-500000,"y":300000},"B":{"x":900000,"y":-200000},"C":{"x":500,"y":80000}}\n%% graph:groups {"G":{"x":-800000,"y":0,"width":900000,"height":600000}}\n%% graph:connections {"A>B#0":{"bendFrom":{"x":800000,"y":-400000}}}\n';
 await page.locator('#file').setInputFiles({name:'perdido.mmd',mimeType:'text/plain',buffer:Buffer.from(source)});await expect(page.locator('#filename')).toHaveText('perdido.mmd');
 await expect(page.locator('#render-state')).toHaveText('Vista anterior · código con errores');await expect(page.locator('#error')).toContainText('El diagrama supera los límites de complejidad o tamaño.');
 await expect(page.locator('#relayout')).toBeEnabled();await command(page,'relayout');await ready(page);
 const text=await page.locator('.cm-content').innerText();expect(text).not.toContain('%% graph:positions');expect(text).not.toContain('%% graph:groups');expect(text).not.toContain('%% graph:connections');
 expect(text).toContain('style G fill:#ffffdd');await expect(page.locator('#diagram g.node')).toHaveCount(3);
 const v=(await page.locator('#diagram-viewport').boundingBox())!;
 for(const n of await page.locator('#diagram g.node').all()){const b=(await n.boundingBox())!;expect(b.x).toBeGreaterThanOrEqual(v.x);expect(b.y).toBeGreaterThanOrEqual(v.y);expect(b.x+b.width).toBeLessThanOrEqual(v.x+v.width);expect(b.y+b.height).toBeLessThanOrEqual(v.y+v.height);}
 await command(page,'undo');await expect(page.locator('#render-state')).toHaveText('Vista anterior · código con errores');await expect(page.locator('#error')).toContainText('El diagrama supera los límites de complejidad o tamaño.');expect(await page.locator('.cm-content').innerText()).toContain('900000');
});
