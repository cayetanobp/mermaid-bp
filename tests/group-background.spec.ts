import {reopenSavedDocument} from './document-helpers';
import {command} from './menu-helpers';
import {test,expect,type Page} from '@playwright/test';
const ready=(p:Page)=>expect(p.locator('#render-state')).toHaveText('Actualizado');
async function open(p:Page,text:string) {
  await p.goto('/');await ready(p);await command(p,'save');
  await p.locator('#file').setInputFiles({name:'grupos.mmd',mimeType:'text/plain',buffer:Buffer.from(text)});await expect(p.locator('#filename')).toHaveText('grupos.mmd');await ready(p);
}
async function scene(p:Page,selector='#diagram svg') {
  return p.locator(selector).evaluate((root:SVGSVGElement)=>{
    const group=root.querySelector<SVGGElement>('g.cluster:is(#G,[id$="-G"])')!,rect=group.querySelector<SVGRectElement>(':scope > rect')!;
    return {box:Object.fromEntries(Object.entries({x:rect.x.baseVal.value,y:rect.y.baseVal.value,width:rect.width.baseVal.value,height:rect.height.baseVal.value}).map(([key,value])=>[key,(Math.round(value*1e6)/1e6)||0])) as {x:number;y:number;width:number;height:number},
      nodes:[...root.querySelectorAll('g.node')].map(n=>{const m=(n as SVGGElement).transform.baseVal.consolidate()!.matrix;return [m.a,m.b,m.c,m.d,m.e,m.f].map(v=>Math.round(v*1e6)/1e6);}),
      title:(()=>{const m=group.querySelector<SVGGElement>('.cluster-label')!.transform.baseVal.consolidate()!.matrix;return [m.a,m.b,m.c,m.d,m.e,m.f].map(v=>Math.round(v*1e6)/1e6);})()};
  });
}
async function drag(p:Page,x:number,y:number,dx:number,dy:number,cancel=false) {
  await p.mouse.move(x,y);await p.mouse.down();await p.mouse.move(x+dx,y+dy,{steps:8});
  if(cancel)await p.keyboard.press('Escape');
  await p.mouse.up();await ready(p);
}
const example='%% mermaid-bp:manual-layout\nflowchart TD\nsubgraph G["Grupo de prueba"]\nA[Uno] --> B[Dos]\nend\nC[Fuera]\nstyle G fill:#ffffdd';
test('el fondo se mueve y redimensiona sin mover nodos y coincide al recargar',async({page,context})=>{
  page.on('dialog',d=>d.accept());await open(page,example);
  const rect=page.locator('g.cluster:is(#G,[id$="-G"]) > rect'),r=(await rect.boundingBox())!,before=await scene(page);
  await drag(page,r.x+8,r.y+r.height/2,30,15);
  await expect(page.locator('.group-handle')).toHaveCount(4);
  const moved=await scene(page);expect(moved.box.x).toBeGreaterThan(before.box.x+10);expect(moved.nodes).toEqual(before.nodes);
  await expect(page.locator('.cm-content')).toContainText('%% graph:groups ');
  const h=(await page.locator('[data-group-resize="se"]').boundingBox())!;
  await drag(page,h.x+h.width/2,h.y+h.height/2,45,25);
  const resized=await scene(page);expect(resized.box.width).toBeGreaterThan(moved.box.width+20);expect(resized.nodes).toEqual(before.nodes);
  const h2=(await page.locator('[data-group-resize="nw"]').boundingBox())!;
  await drag(page,h2.x+h2.width/2,h2.y+h2.height/2,-20,-20,true);
  expect(await scene(page)).toEqual(resized);
  const a=(await page.locator('[data-node-id="A"]').boundingBox())!;
  await drag(page,a.x+a.width/2,a.y+a.height/2,-90,-70);
  const nodeMoved=await scene(page);expect(nodeMoved.box).toEqual(resized.box);expect(nodeMoved.nodes).not.toEqual(resized.nodes);
  await reopenSavedDocument(page);await ready(page);expect(await scene(page)).toEqual(nodeMoved);
  await page.screenshot({path:'test-results/fondo-independiente.png'});
});
test('ajustar al contenido reduce un fondo sobredimensionado y permite deshacer',async({page})=>{
  page.on('dialog',d=>d.accept());await open(page,example+'\n%% graph:groups {"G":{"x":0,"y":0,"width":700,"height":500}}\n');
  const r=(await page.locator('g.cluster:is(#G,[id$="-G"]) > rect').boundingBox())!;
  await page.mouse.click(r.x+8,r.y+30);
  const before=await scene(page);await page.getByRole('button',{name:'Ajustar al contenido'}).click();
  const fitted=await scene(page);expect(fitted.box.width).toBeLessThan(before.box.width);expect(fitted.box.height).toBeLessThan(before.box.height);expect(fitted.nodes).toEqual(before.nodes);
  await command(page,'undo');await ready(page);expect((await scene(page)).box).toEqual(before.box);
});

test('mover un nodo interior no amplía el fondo aunque todavía no se haya redimensionado',async({page})=>{
  page.on('dialog',d=>d.accept());await open(page,example);
  const before=await scene(page),a=(await page.locator('[data-node-id="A"]').boundingBox())!;
  await drag(page,a.x+a.width/2,a.y+a.height/2,-80,-55);
  const after=await scene(page);expect(after.box).toEqual(before.box);expect(after.nodes).not.toEqual(before.nodes);
});
