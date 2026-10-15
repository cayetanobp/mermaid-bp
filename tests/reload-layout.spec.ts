import {reopenSavedDocument} from './document-helpers';
import {test,expect,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {command} from './menu-helpers';
const ready=(p:Page)=>expect(p.locator('#render-state')).toHaveText('Actualizado');
async function geometry(page:Page){return page.locator('#diagram svg').evaluate((root:SVGSVGElement)=>{
 const inverse=root.getScreenCTM()!.inverse();
 const box=(el:SVGGraphicsElement)=>{const b=el.getBBox(),m=inverse.multiply(el.getScreenCTM()!),p=new DOMPoint(b.x,b.y).matrixTransform(m);return [p.x,p.y,b.width*m.a,b.height*m.d].map(n=>Math.round(n*100)/100);};
 return {nodes:[...root.querySelectorAll<SVGGraphicsElement>('g.node')].map(el=>box(el)),groups:[...root.querySelectorAll<SVGGraphicsElement>('g.cluster > rect')].map(el=>box(el)),paths:[...root.querySelectorAll<SVGPathElement>('path.flowchart-link')].map(el=>[0,0.5,1].map(t=>{const p=el.getPointAtLength(el.getTotalLength()*t);return [p.x,p.y].map(n=>Math.round(n*100)/100);}))};
});}
test('reabrir el archivo restaura la misma geometría que abrir el archivo y conserva los controles',async({page})=>{
 page.on('dialog',d=>d.accept());await page.goto('/');await ready(page);await command(page,'save');
 const source=await readFile(new URL('./fixtures/large-workflow-positioned.mmd',import.meta.url),'utf8');await page.locator('#file').setInputFiles({name:'restaurar.mmd',mimeType:'text/plain',buffer:Buffer.from(source)});await ready(page);
 await page.locator('path.flowchart-link[data-edge-index="9"]').dispatchEvent('pointerdown',{button:0,pointerId:90});
 const h=(await page.locator('[data-bend-end="to"]').boundingBox())!;await page.mouse.move(h.x+h.width/2,h.y+h.height/2);await page.mouse.down();await page.mouse.move(h.x+h.width/2+30,h.y+h.height/2+20,{steps:8});await page.mouse.up();await ready(page);
 await page.locator('#inspector-close').click();const before=await geometry(page);
 for(let i=0;i<3;i++){
  await reopenSavedDocument(page);await ready(page);const after=await geometry(page);expect(after.groups).toEqual(before.groups);expect(after.nodes).toEqual(before.nodes);expect(after.paths[after.paths.length-1]).toEqual(before.paths[before.paths.length-1]);
  await page.locator('path.flowchart-link[data-edge-index="9"]').dispatchEvent('pointerdown',{button:0,pointerId:90});await expect(page.locator('.port-handle')).toHaveCount(2);await expect(page.locator('.bend-handle')).toHaveCount(2);for(const selector of ['[data-port-end="from"]','[data-port-end="to"]','[data-bend-end="from"]','[data-bend-end="to"]'])expect(await page.locator(selector).evaluate(el=>{const r=el.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===el;})).toBe(true);await page.locator('#inspector-close').click();
 }
});

test('guardar y reabrir el mismo archivo tienen los mismos grupos y conexiones',async({page})=>{
 page.on('dialog',d=>d.accept());await page.goto('/');await ready(page);await command(page,'save');
 const source='%% mermaid-bp:manual-layout\nflowchart TD\nsubgraph G[Exterior]\nsubgraph H[Interior]\nA[Uno] -->|Siguiente| B[Dos]\nend\nC[Tres]\nend\nB -->|Repetir| B\nB --> C\n%% graph:positions {"A":{"x":180,"y":130},"B":{"x":390,"y":260},"C":{"x":680,"y":410}}\n%% graph:groups {"G":{"x":20,"y":20,"width":800,"height":500},"H":{"x":80,"y":70,"width":470,"height":300}}\n%% graph:connections {"A>B#0":{"from":0,"to":180,"bendFrom":{"x":110,"y":-70},"bendTo":{"x":-100,"y":70}}}\n';
 await page.locator('#file').setInputFiles({name:'anidados.mmd',mimeType:'text/plain',buffer:Buffer.from(source)});await ready(page);const opened=await geometry(page);
 await reopenSavedDocument(page);await ready(page);expect(await geometry(page)).toEqual(opened);
 for(const index of [0,1,2]){
  await page.locator(`path.flowchart-link[data-edge-index="${index}"]`).dispatchEvent('pointerdown',{button:0,pointerId:90});const handle=page.locator('[data-bend-end="from"]'),box=(await handle.boundingBox())!,before=await page.locator(`path.flowchart-link[data-edge-index="${index}"]`).getAttribute('d');
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+25,box.y+box.height/2+20,{steps:8});await page.mouse.up();await ready(page);expect(await page.locator(`path.flowchart-link[data-edge-index="${index}"]`).getAttribute('d')).not.toBe(before);
 }
 await page.locator('#inspector-close').click();const edited=await geometry(page);await reopenSavedDocument(page);await ready(page);const after=await geometry(page);expect(after.groups).toEqual(edited.groups);expect(after.nodes).toEqual(edited.nodes);
});
