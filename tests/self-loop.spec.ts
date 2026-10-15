import {reopenSavedDocument,openBookStack} from './document-helpers';
import {test,expect,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {command} from './menu-helpers';
const ready=(page:Page)=>expect(page.locator('#render-state')).toHaveText('Actualizado');
async function code(page:Page,text:string){const editor=page.getByRole('textbox',{name:'Código Mermaid'});await editor.click();await editor.press('ControlOrMeta+a');await page.keyboard.insertText(text);await ready(page);}
async function selectLoop(page:Page,index:number){await page.locator(`[data-edge-label="${index}"]`).click();await expect(page.locator('.port-handle')).toHaveCount(2);await expect(page.locator('.bend-handle')).toHaveCount(2);}
async function bend(page:Page,end:'from'|'to',dx:number,dy:number){const box=(await page.locator(`[data-bend-end="${end}"]`).boundingBox())!;await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+dx,box.y+box.height/2+dy,{steps:12});await page.mouse.up();await ready(page);}
const path=(page:Page,index:number)=>page.locator(`path.flowchart-link[data-edge-index="${index}"]`).first().getAttribute('d');
const normalize=(value:string|null)=>value?.replace(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi,n=>String(Math.round(Number(n)*1e5)/1e5));
async function attached(page:Page,index:number,id:string){
 const result=await page.locator('#diagram svg').evaluate((root:SVGSVGElement,{index,id})=>{
  const edge=[...root.querySelectorAll<SVGPathElement>(`path.flowchart-link[data-edge-index="${index}"]`)].find(path=>getComputedStyle(path).display!=='none')!;
  const node=[...root.querySelectorAll<SVGGElement>('[data-node-id]')].find(node=>node.dataset.nodeId===id)!,shape=node.querySelector<SVGGeometryElement>('.label-container')!;
  return [0,edge.getTotalLength()].map(distance=>{const point=edge.getPointAtLength(distance).matrixTransform(edge.getScreenCTM()!).matrixTransform(shape.getScreenCTM()!.inverse());const tests=[-6,0,6].flatMap(dx=>[-6,0,6].map(dy=>shape.isPointInFill(new DOMPoint(point.x+dx,point.y+dy))));return tests.some(Boolean)&&tests.some(value=>!value);});
 },{index,id});expect(result).toEqual([true,true]);
}
test.beforeEach(async({page})=>{page.on('dialog',dialog=>dialog.accept());await page.goto('/');await ready(page);});

test('la relación recursiva se selecciona con clic real en su etiqueta y permite mover ambos controles',async({page})=>{
 await code(page,'flowchart TD\nstart["Inicio"] --> retry["Revisar el registro de prueba"]\nretry -->|Intentar de nuevo| retry\nretry --> finish["Continuar"]');
 await expect(page.locator('path.flowchart-link[data-edge-index="1"]')).toHaveCount(1);await expect(page.locator('.edge-hit[data-hit-edge="1"]')).toHaveCount(1);await selectLoop(page,1);
 const before=await path(page,1),node=(await page.locator('[data-node-id="retry"]').boundingBox())!,camera=await page.locator('#diagram-stage').getAttribute('style');
 await bend(page,'from',65,30);await attached(page,1,'retry');await bend(page,'to',-45,40);await attached(page,1,'retry');expect(await path(page,1)).not.toBe(before);
 const after=(await page.locator('[data-node-id="retry"]').boundingBox())!;expect(after.x+after.width/2).toBeCloseTo(node.x+node.width/2,3);expect(after.y+after.height/2).toBeCloseTo(node.y+node.height/2,3);expect(await page.locator('#diagram-stage').getAttribute('style')).toBe(camera);
 await expect(page.locator('.cm-content')).toContainText('"bendFrom"');await expect(page.locator('.cm-content')).toContainText('"bendTo"');await page.screenshot({path:'test-results/bucle-editable.png'});
 const saved=await page.locator('.cm-content').innerText(),curve=normalize(await path(page,1));await reopenSavedDocument(page);await ready(page);expect(await page.locator('.cm-content').innerText()).toBe(saved);expect(normalize(await path(page,1))).toBe(curve);await attached(page,1,'retry');
});
test('el bucle del diagrama sintético sigue anclado al nodo al abrirlo, moverlo y comprobar BookStack',async({page,context})=>{
 const source=await readFile(new URL('./fixtures/large-workflow-positioned.mmd',import.meta.url),'utf8');await command(page,'save');await page.locator('#file').setInputFiles({name:'bucle-sintetico.mmd',mimeType:'text/plain',buffer:Buffer.from(source)});await ready(page);
 await expect(page.locator('path.flowchart-link[data-edge-index="9"]')).toHaveCount(1);await attached(page,9,'retry');await selectLoop(page,9);await bend(page,'to',40,30);await attached(page,9,'retry');
 const curve=normalize(await path(page,9)),check=await openBookStack(page);await expect(check.locator('#check-state')).toContainText('posiciones del editor');
 const other=await check.locator('path.flowchart-link[id$="L_retry_retry_0"]').getAttribute('d');expect(normalize(other)).toBe(curve);await check.close();
 await reopenSavedDocument(page);await ready(page);await attached(page,9,'retry');expect(normalize(await path(page,9))).toBe(curve);
});
test('la edición del bucle permite deshacer, rehacer y restablecer sin perder su conexión',async({page})=>{
 await code(page,'flowchart TD\nA["Origen y destino"] -->|Revisar de nuevo| A\nA --> B["Siguiente paso"]');const original=await page.locator('.cm-content').innerText();await selectLoop(page,0);await bend(page,'from',55,30);await bend(page,'to',-40,45);const changed=await page.locator('.cm-content').innerText();
 await command(page,'undo');await ready(page);await command(page,'undo');await ready(page);expect(await page.locator('.cm-content').innerText()).toBe(original);await command(page,'redo');await ready(page);await command(page,'redo');await ready(page);expect(await page.locator('.cm-content').innerText()).toBe(changed);await selectLoop(page,0);await page.getByRole('button',{name:'Restablecer conexión',exact:true}).click();await attached(page,0,'A');await expect(page.locator('path.flowchart-link[data-edge-index="0"]')).toHaveCount(1);await expect(page.locator('.cm-content')).toContainText('-->|Revisar de nuevo| A');
});
test('editar el bucle no desplaza la conexión siguiente',async({page})=>{
 await code(page,'flowchart LR\nA["Nodo"] -->|Primer bucle| A\nA --> B["Continuar"]');await expect(page.locator('path.flowchart-link[data-edge-index="0"]')).toHaveCount(1);await expect(page.locator('path.flowchart-link[data-edge-index="1"]')).toHaveCount(1);
 const ends=()=>page.locator('path.flowchart-link[data-edge-index="1"]').evaluate((edge:SVGPathElement)=>[0,edge.getTotalLength()].map(d=>{const p=edge.getPointAtLength(d);return{x:p.x,y:p.y};}));const following=await ends();await selectLoop(page,0);await bend(page,'to',30,30);await bend(page,'from',-30,35);expect(await ends()).toEqual(following);await attached(page,0,'A');await expect(page.locator('.cm-content')).toContainText('"A>A#0"');
});
