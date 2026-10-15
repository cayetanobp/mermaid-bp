import {test,expect,type Page}from'@playwright/test';
import{readFile}from'node:fs/promises';
const ready=(p:Page)=>expect(p.locator('#render-state')).toHaveText('Actualizado');
async function code(p:Page,text:string){const e=p.getByRole('textbox',{name:'Código Mermaid'});await e.click();await e.press('ControlOrMeta+a');await p.keyboard.insertText(text);await ready(p);}
const normalized=(s:string|null)=>s?.replace(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi,n=>String(Math.round(Number(n)*1e6)/1e6));
async function selectEdge(p:Page,index:number){await p.locator('path.flowchart-link[data-edge-index="'+index+'"]').first().dispatchEvent('pointerdown',{button:0,pointerId:90});await expect(p.locator('.port-handle')).toHaveCount(2);await expect(p.locator('.bend-handle')).toHaveCount(2);}
async function attached(p:Page,from:string,to:string,index:number){
  const result=await p.locator('#diagram svg').evaluate((root:SVGSVGElement,{from,to,index})=>{
    const paths=[...root.querySelectorAll<SVGPathElement>('path.flowchart-link[data-edge-index="'+index+'"]')].filter(path=>getComputedStyle(path).display!=='none');
    return [from,to].map((id,i)=>{
      const node=[...root.querySelectorAll<SVGGElement>('[data-node-id]')].find(n=>n.dataset.nodeId===id)!;
      const shape=node.querySelector<SVGGeometryElement>('rect.label-container,polygon.label-container,path.label-container,circle.label-container,ellipse.label-container')??node.querySelector<SVGGeometryElement>('rect,polygon,path,circle,ellipse')!;
      const path=i===0?paths[0]:paths.at(-1)!,point=path.getPointAtLength(i===0?0:path.getTotalLength()).matrixTransform(path.getScreenCTM()!).matrixTransform(shape.getScreenCTM()!.inverse());
      const tests=[-6,0,6].flatMap(dx=>[-6,0,6].map(dy=>shape.isPointInFill(new DOMPoint(point.x+dx,point.y+dy))));
      return {id,near:tests.some(Boolean)&&tests.some(v=>!v)};
    });
  },{from,to,index});
  for(const item of result)expect(item.near,'extremo junto a '+item.id).toBe(true);
}
test.beforeEach(async({page})=>{page.on('dialog',d=>d.accept());await page.goto('/');await ready(page);});
test('crear relación eligiendo origen y destino en el lienzo y completar sus datos',async({page})=>{
  await code(page,'flowchart TD\nA["primero"]\nB["segundo"]\nC["tercero"]');
  const before=await page.locator('.cm-content').innerText();
  await page.locator('#connect-nodes').click();await page.locator('[data-node-id="C"]').click();await page.locator('[data-node-id="A"]').click();
  await expect(page.locator('#edge-dialog')).toBeVisible();await expect(page.locator('#edge-from')).toHaveValue('C');await expect(page.locator('#edge-to')).toHaveValue('A');
  await page.locator('#edge-label').fill('enlace elegido');await page.locator('#edge-form button[type=submit]').click();await ready(page);
  await expect(page.locator('path.flowchart-link')).toHaveCount(1);await expect(page.locator('.cm-content')).toContainText('enlace elegido');
  await page.locator('#undo').click();await ready(page);expect(await page.locator('.cm-content').innerText()).toBe(before);
  await page.locator('#add-edge').click();await page.locator('#edge-label').fill('texto conservado');await page.locator('#edge-pick').click();
  await page.locator('[data-node-id="A"]').click();await page.locator('[data-node-id="B"]').click();await expect(page.locator('#edge-label')).toHaveValue('texto conservado');
  await page.locator('#edge-cancel').click();await page.locator('#connect-nodes').click();await page.locator('[data-node-id="B"]').click();await page.keyboard.press('Escape');
  await expect(page.locator('#connect-nodes')).toHaveAttribute('aria-pressed','false');expect(await page.locator('.cm-content').innerText()).toBe(before);
});
test('dos controles Bézier cambian la curva manteniendo el mismo par y sobreviven a recarga y BS',async({page,context})=>{
  await code(page,'flowchart LR\nA["origen"] -->|texto| B["destino"]');
  await selectEdge(page,0);await attached(page,'A','B',0);
  await page.evaluate(()=>{(window as any).bezierRenders=0;new MutationObserver(changes=>changes.forEach(c=>c.addedNodes.forEach(n=>{if(n instanceof Element&&n.classList.contains('render-host'))(window as any).bezierRenders++;}))).observe(document.body,{childList:true});});
  for(const end of ['from','to']){
    const h=(await page.locator('[data-bend-end="'+end+'"]').boundingBox())!;
    await page.mouse.move(h.x+h.width/2,h.y+h.height/2);await page.mouse.down();
    await page.mouse.move(h.x+h.width/2+(end==='from'?25:-20),h.y+h.height/2+(end==='from'?70:-65),{steps:12});await page.mouse.up();await ready(page);
    await attached(page,'A','B',0);
  }
  expect(await page.evaluate(()=>(window as any).bezierRenders)).toBe(0);
  await expect(page.locator('path.flowchart-link')).toHaveAttribute('id','L_A_B_0');
  await expect(page.locator('.cm-content')).toContainText('"bendFrom"');await expect(page.locator('.cm-content')).toContainText('"bendTo"');
  const source=await page.locator('.cm-content').innerText(),path=normalized(await page.locator('path.flowchart-link').getAttribute('d'));
  const check=await context.newPage();await check.goto('/bookstack.html');await expect(check.locator('#check-state')).toContainText('posiciones del editor');
  expect(normalized(await check.locator('path.flowchart-link').getAttribute('d'))).toBe(path);
  await page.reload();await ready(page);expect(await page.locator('.cm-content').innerText()).toBe(source);expect(normalized(await page.locator('path.flowchart-link').getAttribute('d'))).toBe(path);await attached(page,'A','B',0);
  await selectEdge(page,0);
  const endpoint=(await page.locator('[data-port-end="from"]').boundingBox())!,node=(await page.locator('[data-node-id="A"]').boundingBox())!;
  await page.mouse.move(endpoint.x+endpoint.width/2,endpoint.y+endpoint.height/2);await page.mouse.down();await page.mouse.move(node.x+node.width/2,node.y-50,{steps:15});await page.mouse.up();await ready(page);await attached(page,'A','B',0);
  await page.screenshot({path:'test-results/bezier-cuatro-controles.png'});
});
test('un bucle permite ajustar ambos controles sin perder el nodo de anclaje',async({page})=>{
  await code(page,'flowchart TD\nA["bucle"] -->|revisar| A');
  await selectEdge(page,0);await page.getByRole('button',{name:'Origen ↻'}).click();
  await attached(page,'A','A',0);
  const h=(await page.locator('[data-bend-end="to"]').boundingBox())!;await page.mouse.move(h.x+h.width/2,h.y+h.height/2);await page.mouse.down();await page.mouse.move(h.x+65,h.y-45,{steps:10});await page.mouse.up();await ready(page);await attached(page,'A','A',0);
  await expect(page.locator('.cm-content')).toContainText('"bendTo"');
  await page.getByRole('button',{name:'Restablecer conexión'}).click();await expect(page.locator('path.flowchart-link')).toHaveCount(3);
});
