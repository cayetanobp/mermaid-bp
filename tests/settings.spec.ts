import {test,expect,type Page} from '@playwright/test';
import {command} from './menu-helpers';
async function ready(page:Page){page.on('dialog',dialog=>dialog.accept());await page.goto('/');await expect(page.locator('#render-state')).toHaveText('Actualizado');}
const snapshot=(page:Page)=>page.evaluate(()=>({draft:localStorage.getItem('mermaid-bp:draft:v1'),camera:document.getElementById('diagram-stage')!.style.transform}));
const size=(page:Page)=>page.locator('.cm-editor').evaluate(el=>getComputedStyle(el).fontSize);

test('configuración con lateral aplica preferencias de editor sin modificar documento, cámara o historial',async({page})=>{
 await ready(page);const before=await snapshot(page);await command(page,'settings-button');await expect(page.locator('#settings-dialog')).toBeVisible();await expect(page.getByRole('tab',{name:'General',exact:true})).toHaveAttribute('aria-selected','true');
 await page.getByRole('tab',{name:'Editor',exact:true}).click();await page.getByLabel('Tamaño del texto',{exact:true}).selectOption('18');await page.getByLabel('Ajustar líneas al ancho',{exact:true}).uncheck();await page.getByLabel('Mostrar números de línea',{exact:true}).uncheck();await page.getByLabel('Resaltar la línea actual',{exact:true}).uncheck();
 await page.locator('#plugins-close').click();expect(await size(page)).toBe('18px');await expect(page.locator('.cm-lineNumbers')).toHaveCount(0);await expect(page.locator('.cm-lineWrapping')).toHaveCount(0);await expect(page.locator('.cm-activeLine')).toHaveCount(0);expect(await snapshot(page)).toEqual(before);
 await page.reload();await expect(page.locator('#render-state')).toHaveText('Actualizado');expect(await size(page)).toBe('18px');await expect(page.locator('.cm-lineNumbers')).toHaveCount(0);
 await command(page,'save');await page.locator('#file').setInputFiles({name:'preferencias.mmd',mimeType:'text/plain',buffer:Buffer.from('flowchart LR\nA["Archivo nuevo"] --> B["Mismos ajustes"]')});await expect(page.locator('#filename')).toHaveText('preferencias.mmd');await expect(page.locator('#render-state')).toHaveText('Actualizado');expect(await size(page)).toBe('18px');await expect(page.locator('.cm-lineNumbers')).toHaveCount(0);
 const editor=page.getByRole('textbox',{name:'Código Mermaid'});await editor.click();await editor.press('ControlOrMeta+End');await page.keyboard.insertText('\nC["Prueba de historial"]');await expect(page.locator('#render-state')).toHaveText('Actualizado');await command(page,'undo');await expect(page.locator('#render-state')).toHaveText('Actualizado');await expect(editor).not.toContainText('Prueba de historial');
});
test('importar un documento con cambios pendientes permite seguir usando la configuración abierta',async({page})=>{
 await ready(page);await page.getByRole('textbox',{name:'Código Mermaid'}).click();await page.keyboard.press('ControlOrMeta+End');await page.keyboard.insertText('\nA["Cambio pendiente"]');await expect(page.locator('#render-state')).toHaveText('Actualizado');
 await command(page,'settings-button');await expect(page.locator('#settings-dialog')).toBeVisible();
 const imported='flowchart LR\nA["Documento importado"] --> B["Sigue disponible"]\n';
 await page.locator('#file').setInputFiles({name:'importado.mmd',mimeType:'text/plain',buffer:Buffer.from(imported)});
 await expect(page.locator('#confirm-dialog')).toBeVisible();await page.getByRole('button',{name:'Continuar sin descargar',exact:true}).click();
 await expect(page.locator('#message')).toHaveText('Abierto importado.mmd.');await expect(page.locator('.cm-content')).toContainText('Documento importado');
 await expect(page.locator('#settings-dialog')).toBeVisible();await page.getByRole('tab',{name:'Editor',exact:true}).click();await page.getByLabel('Tamaño del texto',{exact:true}).selectOption('18');
 await page.getByRole('tab',{name:'Extensiones',exact:true}).click();await expect(page.locator('#plugin-list')).toBeVisible();await page.locator('#plugins-close').click();
 await expect(page.locator('#settings-dialog')).toBeHidden();await expect(page.locator('.cm-content')).toContainText('Documento importado');expect(await size(page)).toBe('18px');
});
test('general recuerda vista preferida y reduce movimiento sin alterar zoom ni el archivo',async({page})=>{
 await ready(page);const before=await snapshot(page);await command(page,'settings-button');await page.getByLabel('Vista al abrir',{exact:true}).selectOption('cascade');await page.getByLabel('Animaciones',{exact:true}).selectOption('reduce');await page.getByLabel('Mostrar ayuda bajo el diagrama',{exact:true}).uncheck();await page.locator('#plugins-close').click();await expect(page.locator('#visual-note')).toBeHidden();expect(await snapshot(page)).toEqual(before);
 await page.reload();await expect(page.locator('#render-state')).toHaveText('Actualizado');await expect(page.locator('#tab-cascade')).toHaveAttribute('aria-selected','true');await page.locator('[data-cascade-node]').first().click();await page.locator('#locate-node').click();expect(await page.locator('.node-location').evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
 await page.locator('#tab-code').click();await page.reload();await expect(page.locator('#render-state')).toHaveText('Actualizado');await expect(page.locator('#tab-cascade')).toHaveAttribute('aria-selected','true');
});
test('cuadrícula y sensibilidad cambian solo el lienzo y sus controles',async({page})=>{
 await ready(page);const before=await snapshot(page);await command(page,'settings-button');await page.getByRole('tab',{name:'Diagrama',exact:true}).click();await page.getByLabel('Mostrar cuadrícula',{exact:true}).uncheck();await page.getByLabel('Sensibilidad del zoom',{exact:true}).selectOption('2');await page.locator('#plugins-close').click();expect(await page.locator('#diagram-viewport').evaluate(el=>getComputedStyle(el).backgroundImage)).toBe('none');expect(await snapshot(page)).toEqual(before);
 const scale=()=>page.locator('#diagram-stage').evaluate(el=>new DOMMatrix(getComputedStyle(el).transform).a),initial=await scale();await page.locator('#diagram-viewport').hover();await page.mouse.wheel(0,80);await expect.poll(scale).toBeCloseTo(initial*Math.exp(-80*.002*2),4);
});
test('navegación lateral con teclado y cierre devuelven el foco al menú',async({page})=>{
 await ready(page);await command(page,'settings-button');await expect(page.locator('#settings-tab-general')).toBeFocused();await page.keyboard.press('ArrowDown');await expect(page.locator('#settings-tab-editor')).toBeFocused();await expect(page.locator('#settings-editor')).toBeVisible();await page.locator('#settings-tab-general').focus();await page.keyboard.press('Space');await expect(page.locator('#settings-tab-general')).toHaveAttribute('aria-selected','true');await page.keyboard.press('End');await expect(page.locator('#settings-tab-extensions')).toBeFocused();await page.keyboard.press('Home');await expect(page.locator('#settings-tab-general')).toBeFocused();await page.keyboard.press('Escape');await expect(page.locator('#settings-dialog')).toBeHidden();await expect(page.locator('#menu-configuracion')).toBeFocused();
});
test('datos de preferencias inválidos no impiden abrir el editor',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('mermaid-bp:preferences:v1',JSON.stringify({editorFontSize:999,lineNumbers:'no',lineWrapping:null,defaultPane:'bad',zoomSpeed:100,motion:'bad'})));await ready(page);expect(await size(page)).toBe('12px');await expect(page.locator('.cm-lineNumbers')).toHaveCount(1);await expect(page.locator('#tab-code')).toHaveAttribute('aria-selected','true');await command(page,'settings-button');await page.getByRole('tab',{name:'Diagrama',exact:true}).click();await expect(page.getByLabel('Sensibilidad del zoom',{exact:true})).toHaveValue('1');
});
test('sin almacenamiento aplica los cambios durante la sesión y avisa',async({page})=>{
 await page.addInitScript(()=>{const set=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='mermaid-bp:preferences:v1')throw new DOMException('Sin espacio','QuotaExceededError');return set.call(this,key,value);};});await ready(page);await command(page,'settings-button');await page.getByRole('tab',{name:'Editor',exact:true}).click();await page.getByLabel('Tamaño del texto',{exact:true}).selectOption('18');await expect(page.locator('#settings-status')).toContainText('durante esta sesión');expect(await size(page)).toBe('18px');
});
test('configuración sencilla y accesible en escritorio y ventana estrecha',async({page})=>{
 await ready(page);await command(page,'settings-button');await page.screenshot({path:'test-results/settings-general.png'});await page.getByRole('tab',{name:'Editor',exact:true}).click();await page.screenshot({path:'test-results/settings-editor.png'});await page.setViewportSize({width:360,height:800});await page.screenshot({path:'test-results/settings-movil.png'});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);const dialog=(await page.locator('#settings-dialog').boundingBox())!;expect(dialog.width).toBeLessThanOrEqual(360);expect(dialog.height).toBeLessThanOrEqual(800);await page.getByRole('tab',{name:'Extensiones',exact:true}).click();await expect(page.locator('#plugin-list')).toContainText('no incluye extensiones');
});

test('la configuración también funciona sin extensiones instaladas',async({page})=>{
 await page.route('**/plugins/',route=>route.fulfill({contentType:'application/json',body:'[]'}));await ready(page);await command(page,'settings-button');await page.getByRole('tab',{name:'Extensiones',exact:true}).click();await expect(page.locator('#plugin-list')).toContainText('no incluye extensiones');await page.getByRole('tab',{name:'Editor',exact:true}).click();await page.getByLabel('Tamaño del texto',{exact:true}).selectOption('16');expect(await size(page)).toBe('16px');
});
test('configuración disponible en pantalla completa sin perder el encuadre',async({page})=>{
 await ready(page);const before=await snapshot(page);await command(page,'diagram-fullscreen');await command(page,'settings-button');await expect(page.locator('#settings-dialog')).toBeVisible();await page.getByRole('tab',{name:'Diagrama',exact:true}).click();await page.getByLabel('Mostrar cuadrícula',{exact:true}).uncheck();await page.locator('#plugins-close').click();await expect(page.locator('#app')).toHaveClass(/diagram-focus/);await page.locator('#diagram-exit-fullscreen').click();await expect.poll(()=>snapshot(page)).toEqual(before);
});

test('ocultar ayuda conserva los avisos de compatibilidad de otros tipos de Mermaid',async({page})=>{
 await ready(page);await command(page,'settings-button');await page.getByLabel('Mostrar ayuda bajo el diagrama',{exact:true}).uncheck();await page.locator('#plugins-close').click();await expect(page.locator('#visual-note')).toBeHidden();const editor=page.getByRole('textbox',{name:'Código Mermaid'});await editor.click();await editor.press('ControlOrMeta+a');await page.keyboard.insertText('sequenceDiagram\nAlice->>Bob: hola');await expect(page.locator('#render-state')).toHaveText('Actualizado');await expect(page.locator('#visual-note')).toBeVisible();await expect(page.locator('#visual-note')).toContainText('El código se conserva íntegro');
});
