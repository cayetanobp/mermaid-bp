import {command} from './menu-helpers';
import {readFile} from 'node:fs/promises';
import {test,expect,type Page} from '@playwright/test';
const ready=(p:Page)=>expect(p.locator('#render-state')).toHaveText('Actualizado');
async function code(p:Page,s:string){const e=p.getByRole('textbox',{name:'Código Mermaid'});await e.click();await e.press('ControlOrMeta+a');await p.keyboard.insertText(s);await ready(p);}
async function attached(p:Page){return p.locator('#diagram svg').evaluate((root:SVGSVGElement)=>{const path=root.querySelector<SVGPathElement>('path.flowchart-link[data-edge-index="0"]')!;return ['from','to'].map((end,i)=>{const h=root.querySelector<SVGCircleElement>(`[data-port-end="${end}"]`)!;const a=new DOMPoint(h.cx.baseVal.value-Number(h.dataset.handleOffsetX??0),h.cy.baseVal.value-Number(h.dataset.handleOffsetY??0)).matrixTransform(root.getScreenCTM()!);const b=path.getPointAtLength(i?path.getTotalLength():0).matrixTransform(path.getScreenCTM()!);return Math.hypot(a.x-b.x,a.y-b.y);});});}
test('los tiradores siguen unidos a la curva después de cada arrastre',async({page})=>{
 page.on('dialog',d=>d.accept());await page.goto('/');await ready(page);
 await code(page,'flowchart TD\nsubgraph G[Grupo]\nA[Origen] -->|continuar| B[Destino]\nend\nB --> C[Fin]');
 await page.locator('path[data-edge-index="0"]').dispatchEvent('pointerdown',{button:0,pointerId:91});
 for(let i=0;i<6;i++){
  const h=(await page.locator('[data-bend-end="from"]').boundingBox())!;
  await page.mouse.move(h.x+h.width/2,h.y+h.height/2);await page.mouse.down();await page.mouse.move(h.x+h.width/2+25,h.y+h.height/2-35,{steps:8});await page.mouse.up();await ready(page);
  for(const distance of await attached(page))expect(distance).toBeLessThan(1);
 }
});
test('ajustar el subgrupo recupera sus márgenes de importación',async({page})=>{
 page.on('dialog',d=>d.accept());await page.goto('/');await ready(page);await code(page,'flowchart TD\nsubgraph G[Grupo]\nA[Origen] --> B[Destino]\nend\nB --> C[Fin]');
 const rect=page.locator('g.cluster > rect');const before=await rect.evaluate(r=>{const b=(r as SVGGraphicsElement).getBBox();return {x:b.x,y:b.y,width:b.width,height:b.height};});
 const b=(await rect.boundingBox())!;await page.mouse.click(b.x+4,b.y+4);
 await page.getByRole('button',{name:'Ajustar al contenido',exact:true}).click();
 const after=await rect.evaluate(r=>{const b=(r as SVGGraphicsElement).getBBox();return {x:b.x,y:b.y,width:b.width,height:b.height};});
 for(const key of ['x','y','width','height'] as const)expect(after[key]).toBeCloseTo(before[key],1);
});
test('el control no deriva al ampliar el lienzo con curvas grandes',async({page})=>{
 page.on('dialog',d=>d.accept());await page.goto('/');await ready(page);
 await code(page,'flowchart LR\nsubgraph G[Grupo]\nA[Origen] -->|continuar| B[Destino]\nend');await command(page,'fit-view');
 await page.locator('path[data-edge-index="0"]').dispatchEvent('pointerdown',{button:0,pointerId:91});
 for(let i=0;i<5;i++){
  const h=(await page.locator('[data-bend-end="from"]').boundingBox())!;const x=h.x+h.width/2,y=h.y+h.height/2;
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x-30,y+150,{steps:12});
  const before=await page.locator('[data-bend-end="from"]').boundingBox();await page.mouse.up();await ready(page);
  const after=(await page.locator('[data-bend-end="from"]').boundingBox())!;
  expect(after.y).toBeCloseTo(before!.y,0);expect(after.x).toBeCloseTo(before!.x,0);
  for(const distance of await attached(page))expect(distance).toBeLessThan(1);
  await command(page,'fit-view');
 }
});

test('recargar ignora un borrador antiguo y descarta el documento actual',async({page})=>{
 page.on('dialog',d=>d.accept());await page.goto('/');await ready(page);
 await page.evaluate(()=>localStorage.setItem('mermaid-bp:draft:v1',JSON.stringify({source:'flowchart TD\nOLD[Documento antiguo]',name:'viejo.mmd',savedSource:'',savedName:'viejo.mmd'})));
 await page.reload();await ready(page);await expect(page.locator('#diagram')).not.toContainText('Documento antiguo');expect(await page.evaluate(()=>localStorage.getItem('mermaid-bp:draft:v1'))).toBeNull();
 await code(page,'flowchart TD\nPRIVATE[Documento de la sesión]');
 await command(page,'add-node');await page.locator('#node-label').fill('Nodo añadido');await page.locator('#node-form button[type=submit]').click();await ready(page);
 await command(page,'undo');await ready(page);await expect(page.locator('#diagram')).not.toContainText('Nodo añadido');
 await command(page,'redo');await ready(page);await expect(page.locator('#diagram')).toContainText('Nodo añadido');
 const download=page.waitForEvent('download');await command(page,'save');const file=await download;const saved=await readFile((await file.path())!,'utf8');expect(saved).toContain('Documento de la sesión');expect(saved).toContain('Nodo añadido');
 expect(await page.evaluate(()=>JSON.stringify(localStorage)+JSON.stringify(sessionStorage))).not.toContain('Documento de la sesión');
 await page.reload();await ready(page);await expect(page.locator('#diagram')).not.toContainText('Documento de la sesión');await expect(page.locator('#filename')).toHaveText('diagrama.mmd');
 await command(page,'save');await page.locator('#file').setInputFiles({name:'guardado.mmd',mimeType:'text/plain',buffer:Buffer.from(saved)});await ready(page);await expect(page.locator('#diagram')).toContainText('Nodo añadido');
});

test('ajustar subgrupos anidados conserva el encuadre original y se puede deshacer',async({page})=>{
 page.on('dialog',d=>d.accept());await page.goto('/');await ready(page);
 await code(page,'flowchart TD\nsubgraph OUT[Exterior]\nsubgraph IN[Interior]\nA[Uno] --> B[Dos]\nend\nC[Tres]\nend');await command(page,'fit-view');
 const capture=()=>page.locator('g.cluster > rect').evaluateAll(rects=>rects.map(r=>{const b=(r as SVGGraphicsElement).getBBox();return [b.x,b.y,b.width,b.height];}));
 const original=await capture();
 for(const id of ['IN','OUT']){
  const rect=page.locator(`g.cluster[id$="-${id}"] > rect`),b=(await rect.boundingBox())!;await page.mouse.click(b.x+4,b.y+4);
  const handle=(await page.locator('[data-group-resize="se"]').boundingBox())!;await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await page.mouse.down();await page.mouse.move(handle.x+handle.width/2+35,handle.y+handle.height/2+25,{steps:8});await page.mouse.up();await ready(page);
  await page.getByRole('button',{name:'Ajustar al contenido',exact:true}).click();await ready(page);
 }
 const fitted=await capture();for(let i=0;i<original.length;i++)for(let j=0;j<4;j++)expect(fitted[i][j]).toBeCloseTo(original[i][j],1);
 await command(page,'undo');await ready(page);expect(await capture()).not.toEqual(fitted);
 await command(page,'redo');await ready(page);const redone=await capture();for(let i=0;i<fitted.length;i++)for(let j=0;j<4;j++)expect(redone[i][j]).toBeCloseTo(fitted[i][j],1);
});

test('ajustar respeta el ancho importado cuando el título es más ancho que los nodos',async({page})=>{
 page.on('dialog',d=>d.accept());await page.goto('/');await ready(page);
 await code(page,'flowchart TD\nsubgraph G[Un título largo para un subgrupo con contenido pequeño]\nA[X] --> B[Y]\nend');
 const rect=page.locator('g.cluster > rect'),capture=()=>rect.evaluate(r=>{const b=(r as SVGGraphicsElement).getBBox();return [b.x,b.y,b.width,b.height];});
 const before=await capture(),b=(await rect.boundingBox())!;await page.mouse.click(b.x+4,b.y+4);await page.getByRole('button',{name:'Ajustar al contenido',exact:true}).click();
 const after=await capture();for(let i=0;i<4;i++)expect(after[i]).toBeCloseTo(before[i],1);
});
