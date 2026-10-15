async function action(page:any,id:string){const button=page.locator('#'+id);if(!await button.isVisible()){const trigger=await button.evaluate((el:Element)=>el.closest('[role="menu"]')?.getAttribute('aria-labelledby'));if(trigger)await page.locator('#'+trigger).click();}await button.click();}
import {test,expect} from '@playwright/test';
const ready=async(p:any)=>{await p.goto('/');await expect(p.locator('#render-state')).toHaveText('Actualizado');};
async function paste(p:any,text:string){const e=p.getByRole('textbox',{name:'Código Mermaid'});await e.click();await e.press('ControlOrMeta+a');await p.keyboard.insertText(text);}
test('producción renderiza, no conserva documentos y no pide recursos externos',async({page})=>{
 const external:string[]=[],writes:string[]=[];page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:'))external.push(r.url());if(!['GET','HEAD'].includes(r.method()))writes.push(r.url());});
 await ready(page);await expect(page.locator('#diagram g.node')).toHaveCount(4);await expect(page.locator('#diagram')).toContainText('Inicio');
 await paste(page,'flowchart LR\nA["Documento privado de prueba"]-->B["Resultado"]');await expect(page.locator('#render-state')).toHaveText('Actualizado');await expect(page.locator('#diagram g.node')).toHaveCount(2);
 const stored=await page.evaluate(()=>({local:JSON.stringify(localStorage),session:JSON.stringify(sessionStorage)}));expect(stored.local).not.toContain('Documento privado');expect(stored.local).not.toContain('mermaid-bp:draft');expect(stored.session).not.toContain('Documento privado');
 await page.reload();await expect(page.locator('#render-state')).toHaveText('Actualizado');await expect(page.locator('#diagram')).not.toContainText('Documento privado');expect(external).toEqual([]);expect(writes).toEqual([]);
});
test('apertura rechaza extensiones falsas, binarios, HTML y Mermaid inválido sin sustituir el documento',async({page})=>{
 await ready(page);const original=await page.locator('.cm-content').innerText();
 for(const [name,source]of [['ataque.html','flowchart TD\nA-->B'],['ataque.mmd.exe','flowchart TD\nA-->B'],['ataque.mmd','<script>window.pwned=true</script>'],['invalido.mmd','flowchart TD\nA["sin cerrar'],['binario.mmd','flowchart TD\nA\u0000B']]){
  await page.locator('#file').setInputFiles({name,mimeType:'text/plain',buffer:Buffer.from(source)});await expect(page.locator('#message')).not.toHaveText(/^Abierto/);expect(await page.locator('.cm-content').innerText()).toBe(original);
 }
 const download=page.waitForEvent('download');await action(page,'save');await download;
 await page.locator('#file').setInputFiles({name:'correcto.mmd',mimeType:'text/plain',buffer:Buffer.from('flowchart TD\nA["Seguro"] --> B["Fin"]')});await expect(page.locator('#filename')).toHaveText('correcto.mmd');await expect(page.locator('#render-state')).toHaveText('Actualizado');await expect(page.locator('#diagram')).toContainText('Seguro');
});
test('código pegado no ejecuta scripts ni permite configurar HTML o CSS activo',async({page})=>{
 await ready(page);await page.evaluate(()=>{(window as any).pwned=false;});
 for(const source of ['flowchart TD\nA["<img src=x onerror=window.pwned=true>"]','%%{init:{"securityLevel":"loose"}}%%\nflowchart TD\nA-->B','flowchart TD\nclick A call pwned()','flowchart TD\nclassDef x fill:url(https://example.invalid/robar)','flowchart TD\nA["<script>window.pwned=true</script>"]']){
  await paste(page,source);await expect(page.locator('#render-state')).toHaveText('No se puede renderizar');expect(await page.evaluate(()=>(window as any).pwned)).toBe(false);await expect(page.locator('#diagram script,#diagram img,#diagram iframe,#diagram a')).toHaveCount(0);await expect(page.locator('#svg')).toBeDisabled();
 }
});
test('BookStack recibe el documento solo en memoria',async({page,context})=>{
 await ready(page);await paste(page,'flowchart TD\nA["Privado en memoria"]-->B["Fin"]');await expect(page.locator('#render-state')).toHaveText('Actualizado');const popup=context.waitForEvent('page');await action(page,'plugin-bookstack-preview');const check=await popup;await expect(check.locator('#check-source')).toHaveValue('flowchart TD\nA["Privado en memoria"]-->B["Fin"]');await expect(check.locator('#check-output svg')).toHaveCount(1);expect(await check.evaluate(()=>JSON.stringify(localStorage))).not.toContain('Privado');
});

test('sanitización del SVG retira scripts, eventos, enlaces e imágenes',async({page})=>{
 const {build}=await import('vite');const result=await build({configFile:false,logLevel:'silent',build:{write:false,lib:{entry:'src/svg-security.ts',formats:['es'],fileName:'sanitize.js'}}});
 const code=(Array.isArray(result)?result:[result]).flatMap(r=>'output'in r?r.output:[]).filter(c=>c.type==='chunk').map(c=>c.code).join('\n');
 await page.route('**/sanitizer-test.js',route=>route.fulfill({contentType:'text/javascript',body:code}));await ready(page);
 const clean=await page.evaluate(async()=>{const {sanitizeDiagram}=await import(/* @vite-ignore */ new URL('./sanitizer-test.js',location.href).href);return sanitizeDiagram('<svg xmlns="http://www.w3.org/2000/svg"><script>window.pwned=true</script><a href="javascript:alert(1)"><text>enlace</text></a><image href="https://example.invalid/x"/><foreignObject><div>activo</div></foreignObject><rect onload="alert(1)" width="20" height="20"/><style>@import url(https://example.invalid/robar);</style></svg>');});
 expect(clean).toContain('<rect');expect(clean).not.toMatch(/<(script|a|image|foreignObject)\b|onload|href|@import|example.invalid/);
});
test('edición visual, arrastre, historial y selección respetan los IDs protegidos',async({page})=>{
 await ready(page);await paste(page,'flowchart LR\nsubgraph G["Unidad"]\nA["Entrada"]-->B["Salida"]\nend\nA-->B');await expect(page.locator('#diagram g.node')).toHaveCount(2);await expect(page.locator('[data-edge-index]')).toHaveCount(2);await action(page,'fit-view');
 const a=page.locator('[data-node-id="A"]'),box=(await a.boundingBox())!;await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+25,box.y+box.height/2+20,{steps:6});await page.mouse.up();await expect(page.locator('.cm-content')).toContainText('%% graph:positions');
 await action(page,'undo');await expect(page.locator('.cm-content')).not.toContainText('%% graph:positions');await expect(page.locator('#render-state')).toHaveText('Actualizado');await action(page,'redo');await expect(page.locator('.cm-content')).toContainText('%% graph:positions');await expect(page.locator('#render-state')).toHaveText('Actualizado');
 await page.locator('[data-edge-index]').first().dispatchEvent('pointerdown',{button:0});await expect(page.locator('[data-port-edge]')).toHaveCount(2);
 await action(page,'add-node');await page.locator('#node-label').fill('Registro nuevo');await page.locator('#node-form button[type=submit]').click();await expect(page.locator('#diagram g.node')).toHaveCount(3);await expect(page.locator('#diagram')).toContainText('Registro nuevo');
});
