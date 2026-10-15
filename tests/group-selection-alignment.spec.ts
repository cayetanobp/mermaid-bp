import {test,expect,type Page,type Locator} from '@playwright/test';
const ready=(page:Page)=>expect(page.locator('#render-state')).toHaveText('Actualizado');
async function open(page:Page,source:string) {
  page.on('dialog',d=>d.accept());await page.goto('/');await ready(page);await page.locator('#save').click();
  await page.locator('#file').setInputFiles({name:'alineacion.mmd',mimeType:'text/plain',buffer:Buffer.from(source)});await ready(page);
}
async function select(page:Page,id='G') {
  const rect=page.locator(`g.cluster#${id} > rect`),box=(await rect.boundingBox())!;
  await page.mouse.click(box.x+4,box.y+4);
  await expect(page.locator('.group-handle')).toHaveCount(4);
}
async function visibleBox(locator:Locator) {
  return locator.evaluate(element=>{const b=element.getBoundingClientRect();return{x:b.x,y:b.y,width:b.width,height:b.height};});
}
async function aligned(page:Page,id='G') {
  const rect=await visibleBox(page.locator(`g.cluster#${id} > rect`));
  const outline=await visibleBox(page.locator('.group-selection'));
  for(const key of ['x','y','width','height'] as const)expect(Math.abs(outline[key]-rect[key]),key).toBeLessThan(0.5);
  for(const corner of ['nw','ne','sw','se']) {
    const handle=await visibleBox(page.locator(`[data-group-resize="${corner}"]`));
    const x=rect.x+(corner.includes('e')?rect.width:0),y=rect.y+(corner.includes('s')?rect.height:0);
    expect(Math.abs(handle.x+handle.width/2-x),corner+' x').toBeLessThan(0.5);
    expect(Math.abs(handle.y+handle.height/2-y),corner+' y').toBeLessThan(0.5);
  }
}
const source='flowchart TD\nsubgraph G["OTRO TIPO DE RECURSO"]\nA[Uno] --> B[Dos]\nend\nC[Fuera]\nstyle G fill:#ffffdd,x:-60px';
test('el primer clic alinea las esquinas con la geometría visible sin ajustar ni modificar el archivo',async({page})=>{
  await open(page,source);const before=await page.locator('.cm-content').innerText();
  await select(page);await aligned(page);
  expect(await page.locator('.cm-content').innerText()).toBe(before);
  await expect(page.locator('#dirty')).toBeHidden();
  await page.screenshot({path:'test-results/subgrupo-alineado-primer-clic.png'});
});
test('mantiene la alineación al cambiar el zoom y tras recargar',async({page})=>{
  await open(page,source);await select(page);await aligned(page);
  const box=(await page.locator('#diagram-viewport').boundingBox())!;
  const beforeZoom=await page.locator('#diagram-stage').getAttribute('style');
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.wheel(0,-120);
  await expect(page.locator('#diagram-stage')).not.toHaveAttribute('style',beforeZoom!);
  await aligned(page);
  await page.reload();await ready(page);await select(page);await aligned(page);
});
test('alinea un subgrupo anidado desde la primera selección',async({page})=>{
  await open(page,'flowchart TD\nsubgraph OUT[Exterior]\nsubgraph G[Interior]\nA[Uno] --> B[Dos]\nend\nC[Tres]\nend\nD[Fuera]\nstyle G x:-25px,y:30px,width:240px');
  await select(page);await aligned(page);
});
