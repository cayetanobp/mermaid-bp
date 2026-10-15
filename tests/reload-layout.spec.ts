import {test,expect,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {command} from './menu-helpers';
const ready=(p:Page)=>expect(p.locator('#render-state')).toHaveText('Actualizado');
async function geometry(page:Page){return page.locator('#diagram svg').evaluate((root:SVGSVGElement)=>{
 const inverse=root.getScreenCTM()!.inverse();
 const box=(el:SVGGraphicsElement)=>{const b=el.getBBox(),m=inverse.multiply(el.getScreenCTM()!),p=new DOMPoint(b.x,b.y).matrixTransform(m);return [p.x,p.y,b.width*m.a,b.height*m.d].map(n=>Math.round(n*100)/100);};
 return {nodes:[...root.querySelectorAll<SVGGraphicsElement>('g.node')].map(el=>box(el)),groups:[...root.querySelectorAll<SVGGraphicsElement>('g.cluster > rect')].map(el=>box(el)),paths:[...root.querySelectorAll<SVGPathElement>('path.flowchart-link')].map(el=>[0,0.5,1].map(t=>{const p=el.getPointAtLength(el.getTotalLength()*t);return [p.x,p.y].map(n=>Math.round(n*100)/100);}))};
});}

test('un borrador recuperado y el mismo archivo abierto tienen los mismos grupos y conexiones',async({page})=>{
 page.on('dialog',d=>d.accept());await page.goto('/');await ready(page);await command(page,'save');
 const source='%% mermaid-bp:manual-layout\nflowchart TD\nsubgraph G[Exterior]\nsubgraph H[Interior]\nA[Uno] -->|Siguiente| B[Dos]\nend\nC[Tres]\nend\nB -->|Repetir| B\nB --> C\n%% graph:positions {"A":{"x":180,"y":130},"B":{"x":390,"y":260},"C":{"x":680,"y":410}}\n%% graph:groups {"G":{"x":20,"y":20,"width":800,"height":500},"H":{"x":80,"y":70,"width":470,"height":300}}\n%% graph:connections {"A>B#0":{"from":0,"to":180,"bendFrom":{"x":110,"y":-70},"bendTo":{"x":-100,"y":70}}}\n';
 await page.locator('#file').setInputFiles({name:'anidados.mmd',mimeType:'text/plain',buffer:Buffer.from(source)});await ready(page);const opened=await geometry(page);
 await page.reload();await ready(page);expect(await geometry(page)).toEqual(opened);
 for(const index of [0,1,2]){
  await page.locator(`path.flowchart-link[data-edge-index="${index}"]`).dispatchEvent('pointerdown',{button:0,pointerId:90});const handle=page.locator('[data-bend-end="from"]'),box=(await handle.boundingBox())!,before=await page.locator(`path.flowchart-link[data-edge-index="${index}"]`).getAttribute('d');
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+25,box.y+box.height/2+20,{steps:8});await page.mouse.up();await ready(page);expect(await page.locator(`path.flowchart-link[data-edge-index="${index}"]`).getAttribute('d')).not.toBe(before);
 }
 await page.locator('#inspector-close').click();const edited=await geometry(page);await page.reload();await ready(page);const after=await geometry(page);expect(after.groups).toEqual(edited.groups);expect(after.nodes).toEqual(edited.nodes);
});
