import {reopenSavedDocument,openBookStack} from './document-helpers';
import {command} from './menu-helpers';
import {test,expect,type Page} from '@playwright/test';
const ready=(p:Page)=>expect(p.locator('#render-state')).toHaveText('Actualizado');
async function open(p:Page,text:string){await p.goto('/');await ready(p);await command(p,'save');await p.locator('#file').setInputFiles({name:'subgrupos.mmd',mimeType:'text/plain',buffer:Buffer.from(text)});await expect(p.locator('#filename')).toHaveText('subgrupos.mmd');await ready(p);}
const positions=(p:Page)=>p.locator('#diagram svg').evaluate((root:SVGSVGElement)=>Object.fromEntries([...root.querySelectorAll<SVGGElement>('[data-node-id]')].map(n=>{
  const b=n.getBBox(),m=root.getCTM()!.inverse().multiply(n.getCTM()!),p=new DOMPoint(b.x+b.width/2,b.y+b.height/2).matrixTransform(m);
  return[n.dataset.nodeId!,{x:Math.round(p.x*100)/100,y:Math.round(p.y*100)/100}];
})));
const source='%% mermaid-bp:manual-layout\nflowchart LR\nA[Uno]\nB[Dos]\nC[Tres]\n%% graph:positions {"A":{"x":70,"y":100},"B":{"x":310,"y":210},"C":{"x":470,"y":90}}\n';
test('crear subgrupo vacío, asignar nodos, renombrar, anidar, sacar nodos y eliminar conservándolos',async({page,context})=>{
 page.on('dialog',d=>d.accept());await open(page,source);const initial=await positions(page);
 await command(page,'manage-groups');await page.locator('#group-name').fill('Mi grupo');await page.getByRole('button',{name:'Guardar subgrupo',exact:true}).click();await ready(page);
 await expect(page.locator('#error')).toBeHidden();await expect(page.locator('.cm-content')).toContainText('subgraph G1["Mi grupo"]');
 await page.locator('[data-node-id="A"]').click();await page.locator('#selection').getByRole('button',{name:'Editar',exact:true}).click();
 await page.locator('#node-group').selectOption('G1');await page.locator('#node-form').getByRole('button',{name:'Aplicar'}).click();await ready(page);
 expect(await positions(page)).toEqual(initial);await expect(page.locator('g.cluster:is(#G1,[id$="-G1"])')).toHaveCount(1);
 await command(page,'manage-groups');await page.locator('#group-name').fill('Renombrado');await page.getByRole('button',{name:'Guardar subgrupo',exact:true}).click();await ready(page);
 await expect(page.locator('g.cluster:is(#G1,[id$="-G1"]) .cluster-label')).toHaveText('Renombrado');
 await command(page,'manage-groups');await page.locator('#group-new').click();await page.locator('#group-name').fill('Interior');await page.locator('#group-parent').selectOption('G1');
 await page.getByRole('button',{name:'Guardar subgrupo',exact:true}).click();await ready(page);await expect(page.locator('#error')).toBeHidden();
 await page.locator('[data-node-id="A"]').click();await page.locator('#selection').getByRole('button',{name:'Editar',exact:true}).click();await page.locator('#node-group').selectOption('G2');
 await page.locator('#node-form').getByRole('button',{name:'Aplicar'}).click();await ready(page);
 await command(page,'manage-groups');await page.locator('#groups-list').selectOption('G1');await page.locator('#group-delete').click();await ready(page);
 await expect(page.locator('#diagram g.node')).toHaveCount(3);await expect(page.locator('g.cluster:is(#G1,[id$="-G1"])')).toHaveCount(0);await expect(page.locator('g.cluster:is(#G2,[id$="-G2"])')).toHaveCount(1);
 expect(await positions(page)).toEqual(initial);
 await page.locator('[data-node-id="A"]').click();await page.locator('#selection').getByRole('button',{name:'Editar',exact:true}).click();await page.locator('#node-group').selectOption('');
 await page.locator('#node-form').getByRole('button',{name:'Aplicar'}).click();await ready(page);await expect(page.locator('#error')).toBeHidden();
 await reopenSavedDocument(page);await ready(page);expect(await positions(page)).toEqual(initial);
 const check=await openBookStack(page);await expect(check.locator('#check-state')).toContainText('posiciones del editor');await expect(check.locator('#check-output g.node')).toHaveCount(await page.locator('#diagram g.node').count());
 for(const id of ['A','B','C'])await expect(check.locator('#check-output [id*="-flowchart-'+id+'-"]')).toHaveCount(1);
});
test('crear una conexión por clics conserva posiciones manuales inmediatamente y al reabrir el archivo',async({page})=>{
 page.on('dialog',d=>d.accept());await open(page,source);const before=await positions(page);
 const screenBefore=await page.locator('[data-node-id="A"]').boundingBox();
 await command(page,'connect-nodes');await page.locator('[data-node-id="A"]').click();await page.locator('[data-node-id="B"]').click();
 await page.locator('#edge-label').fill('Nueva relación');await page.locator('#edge-form').getByRole('button',{name:'Aplicar'}).click();await ready(page);
 expect(await positions(page)).toEqual(before);await expect(page.locator('path.flowchart-link')).toHaveCount(1);
 const screenAfter=(await page.locator('[data-node-id="A"]').boundingBox())!;expect(screenAfter.x).toBeCloseTo(screenBefore!.x,1);expect(screenAfter.y).toBeCloseTo(screenBefore!.y,1);
 const path=await page.locator('path.flowchart-link').getAttribute('d');
 await reopenSavedDocument(page);await ready(page);expect(await positions(page)).toEqual(before);
 expect(await page.locator('path.flowchart-link').getAttribute('d')).toBe(path);
});
