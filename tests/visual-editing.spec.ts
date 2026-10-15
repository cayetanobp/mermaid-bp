import {test,expect,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
const normalizedPath=(path:string|null)=>path?.replace(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi,value=>String(Math.round(Number(value)*1e6)/1e6));
const ready=(p:Page)=>expect(p.locator('#render-state')).toHaveText('Actualizado');
async function code(p:Page,text:string){const e=p.getByRole('textbox',{name:'Código Mermaid'});await e.click();await e.press('ControlOrMeta+a');await p.keyboard.insertText(text);await ready(p);}
async function positions(p:Page){return p.locator('#diagram svg').evaluate((root:SVGSVGElement)=>Object.fromEntries([...root.querySelectorAll<SVGGElement>('[data-node-id]')].map(n=>{
  const shape=n.querySelector<SVGGraphicsElement>('.label-container,rect,polygon,circle,path')!,b=shape.getBBox(),m=root.getCTM()!.inverse().multiply(n.getCTM()!),v=new DOMPoint(b.x+b.width/2,b.y+b.height/2).matrixTransform(m);return[n.dataset.nodeId!,{x:v.x,y:v.y}];
})));}
async function move(p:Page,id:string,dx:number,dy:number){const b=(await p.locator('[data-node-id="'+id+'"]').boundingBox())!;await p.mouse.move(b.x+b.width/2,b.y+b.height/2);await p.mouse.down();await p.mouse.move(b.x+b.width/2+dx,b.y+b.height/2+dy,{steps:8});await p.mouse.up();await ready(p);}
test.beforeEach(async({page})=>{page.on('dialog',d=>d.accept());await page.goto('/');await ready(page);});
test('selección rectangular, movimiento conjunto, Mayús, deshacer y eliminar varios',async({page})=>{
  await code(page,'flowchart TD\nA["uno"] --> B["dos"]\nC["aislado"]');
  const a=(await page.locator('[data-node-id="A"]').boundingBox())!,b=(await page.locator('[data-node-id="B"]').boundingBox())!;
  const x=Math.min(a.x,b.x)-20,y=Math.min(a.y,b.y)-20,right=Math.max(a.x+a.width,b.x+b.width)+20,bottom=Math.max(a.y+a.height,b.y+b.height)+20;
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(right,bottom,{steps:8});await page.mouse.up();
  await expect(page.locator('.selection-ring')).toHaveCount(2);
  const before=await positions(page);await move(page,'A',40,15);const after=await positions(page);
  expect(Math.abs(after.A.x-before.A.x)).toBeGreaterThan(20);
  expect(after.A.x-before.A.x).toBeCloseTo(after.B.x-before.B.x,2);expect(after.A.y-before.A.y).toBeCloseTo(after.B.y-before.B.y,2);
  expect(after.C.x).toBeCloseTo(before.C.x,2);expect(after.C.y).toBeCloseTo(before.C.y,2);
  await page.keyboard.down('Shift');await page.locator('[data-node-id="C"]').click();await page.keyboard.up('Shift');await expect(page.locator('.selection-ring')).toHaveCount(3);
  await page.locator('#selection .danger').click();await expect(page.locator('#diagram g.node')).toHaveCount(0);
  await page.locator('#undo').click();await ready(page);await expect(page.locator('#diagram g.node')).toHaveCount(3);
});
test('las relaciones tienen una zona de clic amplia y anclajes giratorios y arrastrables',async({page,context})=>{
  await code(page,'flowchart LR\nA["origen"] -->|relación| B["destino"]');
  const hit=page.locator('.edge-hit');await expect(hit).toHaveCount(1);await expect(hit).toHaveAttribute('vector-effect','non-scaling-stroke');
  const point=await hit.evaluate((path:SVGPathElement)=>{const p=path.getPointAtLength(path.getTotalLength()*0.25).matrixTransform(path.getScreenCTM()!);return{x:p.x,y:p.y};});
  await page.mouse.click(point.x,point.y+5);await expect(page.locator('.port-handle')).toHaveCount(2);
  const original=await page.locator('path.flowchart-link').getAttribute('d');
  await page.getByRole('button',{name:'Origen ↻'}).click();await expect(page.locator('.cm-content')).toContainText('%% graph:connections ');
  expect(await page.locator('path.flowchart-link').getAttribute('d')).not.toBe(original);
  const savedPath=await page.locator('path.flowchart-link').getAttribute('d'),savedSource=await page.locator('.cm-content').innerText();
  const startHandle=(await page.locator('[data-port-end="from"]').boundingBox())!;
  await page.mouse.move(startHandle.x+startHandle.width/2,startHandle.y+startHandle.height/2);await page.mouse.down();
  await page.mouse.move(startHandle.x+50,startHandle.y-30,{steps:5});await page.keyboard.press('Escape');await page.mouse.up();
  expect(await page.locator('path.flowchart-link').getAttribute('d')).toBe(savedPath);expect(await page.locator('.cm-content').innerText()).toBe(savedSource);
  const handle=page.locator('[data-port-end="to"]'),box=(await handle.boundingBox())!,node=(await page.locator('[data-node-id="B"]').boundingBox())!;
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
  await page.mouse.move(node.x+node.width/2,node.y-30,{steps:10});await page.mouse.up();await ready(page);
  const source=await page.locator('.cm-content').innerText();expect(source).toMatch(/"to":/);
  const path=await page.locator('path.flowchart-link').getAttribute('d');expect(path).toContain(' C');
  await page.screenshot({path:'test-results/anclajes-conexion.png'});
  const check=await context.newPage();await check.goto('/bookstack.html');await expect(check.locator('#check-state')).toContainText('posiciones del editor');
  expect(normalizedPath(await check.locator('path.flowchart-link').getAttribute('d'))).toBe(normalizedPath(path));
  await page.reload();await ready(page);expect(normalizedPath(await page.locator('path.flowchart-link').getAttribute('d'))).toBe(normalizedPath(path));
});
