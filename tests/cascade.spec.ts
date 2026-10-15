import {test,expect,type Page} from '@playwright/test';
const ready=(p:Page)=>expect(p.locator('#render-state')).toHaveText('Actualizado');
const source='flowchart TD\nsubgraph G["Tramitación"]\nA["Iniciar expediente"] --> B["Revisar documentación"]\nsubgraph H["Revisión"]\nC["Publicar resolución"]\nend\nend\nD["Consulta independiente"]\nB -->|Aprobado| C\nC --> A\nB --> B\nstyle G fill:#f9f6da\n';
async function open(p:Page,text=source,name='cascada.mmd'){
 p.on('dialog',d=>d.accept());await p.goto('/');await ready(p);await p.locator('#save').click();
 await p.locator('#file').setInputFiles({name,mimeType:'text/plain',buffer:Buffer.from(text)});
 await expect(p.locator('#filename')).toHaveText(name);await ready(p);
}
const draft=(p:Page)=>p.evaluate(()=>JSON.parse(localStorage.getItem('mermaid-bp:draft:v1')!).source as string);
test('cascada y diagrama comparten ficha, grupos y miembros; solo la cascada muestra relaciones navegables',async({page})=>{
 await open(page);await page.getByRole('tab',{name:'Cascada',exact:true}).click();
 await expect(page.locator('#editor')).toBeHidden();await expect(page.locator('[data-cascade-node]')).toHaveCount(4);
 await page.evaluate(()=>{
  (window as any).cascadeRenderCount=0;
  new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if(node instanceof Element&&node.classList.contains('render-host'))(window as any).cascadeRenderCount++;}).observe(document.body,{childList:true});
 });
 const viewportBefore=await page.locator('#diagram-viewport').boundingBox(),cameraBefore=await page.locator('#diagram-stage').getAttribute('style');
 await page.locator('[data-cascade-node="A"]').click();
 await expect(page.locator('#inspector')).toBeVisible();
 expect(await page.locator('#diagram-viewport').boundingBox()).toEqual(viewportBefore);
 expect(await page.locator('#diagram-stage').getAttribute('style')).toBe(cameraBefore);await expect(page.locator('dialog[open]')).toHaveCount(0);
 await expect(page.locator('#inspector-details .info-title')).toHaveText('Iniciar expediente');
 await expect(page.locator('[data-info-group="G"]')).toHaveText('Tramitación');
 await expect(page.locator('[data-relationships] [data-related-node]')).toHaveCount(2);
 await page.locator('[data-related-node="B"]').click();
 await expect(page.locator('[data-cascade-node="B"]')).toHaveAttribute('aria-pressed','true');await expect(page.locator('[data-cascade-node="B"]')).toBeFocused();
 await expect(page.locator('#inspector-details .info-title')).toHaveText('Revisar documentación');
 await expect(page.locator('[data-relationships] [data-related-node="B"]')).toContainText('Bucle');
 await page.locator('[data-info-group="G"]').click();await expect(page.locator('[data-member-node]')).toHaveCount(3);
 await expect(page.locator('#inspector-details')).toContainText('Revisión');
 await page.locator('[data-member-node="C"]').click();await expect(page.locator('[data-info-group="H"]')).toContainText('Revisión');
 await page.locator('#fit-view').click();await page.locator('[data-node-id="B"]').click();
 await expect(page.locator('[data-relationships]')).toHaveCount(0);await expect(page.locator('[data-info-group="G"]')).toBeVisible();
 await page.locator('[data-info-group="G"]').click();await expect(page.locator('[data-member-node]')).toHaveCount(3);
 await page.locator('#inspector-close').click();await page.locator('#fit-view').click();
 await page.locator('g.cluster#G > rect').click({position:{x:8,y:20}});
 await expect(page.locator('[data-member-node]')).toHaveCount(3);
 expect(await draft(page)).toBe(source);expect(await page.evaluate(()=>(window as any).cascadeRenderCount)).toBe(0);
 await page.screenshot({path:'test-results/cascada-subgrupo.png'});
});
test('búsqueda, enlaces, pestañas accesibles y preferencia de vista sin modificar Mermaid',async({page})=>{
 await open(page);await page.locator('#tab-code').focus();await page.keyboard.press('ArrowRight');
 await expect(page.locator('#tab-cascade')).toBeFocused();await expect(page.locator('#tab-cascade')).toHaveAttribute('aria-selected','true');
 await page.locator('#cascade-search').fill('Iniciar');await expect(page.locator('[data-cascade-node]')).toHaveCount(1);
 await page.locator('[data-cascade-node="A"]').click();await page.locator('[data-related-node="B"]').click();
 await expect(page.locator('#cascade-search')).toHaveValue('');await expect(page.locator('[data-cascade-node="B"]')).toBeFocused();
 await page.locator('#tab-code').click();await expect(page.getByRole('textbox',{name:'Código Mermaid'})).toBeVisible();
 expect(await draft(page)).toBe(source);
 await page.locator('#tab-cascade').click();await page.reload();await ready(page);await expect(page.locator('#tab-cascade')).toHaveAttribute('aria-selected','true');
 await page.locator('#cascade-search').fill('sin resultados');await expect(page.locator('#cascade-list')).toContainText('No hay resultados');
});
test('edición y creación desde cascada usan la misma ficha sin ventanas emergentes',async({page})=>{
 await open(page);await page.locator('#tab-cascade').click();await page.locator('[data-cascade-node="A"]').click();
 await page.locator('#selection').getByRole('button',{name:'Editar',exact:true}).click();await expect(page.locator('#node-dialog')).toBeVisible();
 await expect(page.locator('dialog[open]')).toHaveCount(0);
 await page.locator('#node-label').fill('Expediente actualizado');await page.locator('#node-group').selectOption('H');
 await page.locator('#node-form button[type="submit"]').click();await ready(page);
 await expect(page.locator('[data-cascade-node="A"]')).toContainText('Expediente actualizado');await expect(page.locator('[data-info-group="H"]')).toContainText('Revisión');
 await page.locator('#undo').click();await ready(page);await expect(page.locator('[data-cascade-node="A"]')).toContainText('Iniciar expediente');
 await page.locator('[data-cascade-group="G"]').click();await page.locator('#selection').getByRole('button',{name:'Gestionar subgrupo'}).click();
 await expect(page.locator('#groups-dialog')).toBeVisible();await expect(page.locator('dialog[open]')).toHaveCount(0);
 await page.locator('#group-name').fill('Unidad de tramitación');await page.locator('#groups-form button[type="submit"]').click();await ready(page);
 await expect(page.locator('[data-cascade-group="G"]')).toContainText('Unidad de tramitación');
 await page.locator('#connect-nodes').click();await page.locator('[data-cascade-node="D"]').click();await page.locator('[data-cascade-node="A"]').click();
 await expect(page.locator('#edge-dialog')).toBeVisible();await expect(page.locator('dialog[open]')).toHaveCount(0);
 await page.locator('#edge-label').fill('Consulta');await page.locator('#edge-form button[type="submit"]').click();await ready(page);expect(await draft(page)).toContain('Consulta');
 await page.locator('#add-node').click();await page.locator('#node-label').fill('Nodo nuevo');await page.locator('#node-cancel').click();
 expect(await draft(page)).not.toContain('Nodo nuevo');
});
test('los diagramas avanzados siguen disponibles por código y no presentan una cascada incorrecta',async({page})=>{
 await open(page,'sequenceDiagram\nAlice->>Bob: hola','secuencia.mmd');await page.locator('#tab-cascade').click();
 await expect(page.locator('#cascade-list')).toContainText('disponible para diagramas flowchart y graph');
 await expect(page.locator('#add-node')).toBeDisabled();await page.locator('#tab-code').click();await expect(page.getByRole('textbox',{name:'Código Mermaid'})).toBeVisible();
});
