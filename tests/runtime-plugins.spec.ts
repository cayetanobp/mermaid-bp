import {command} from './menu-helpers';
import {test,expect} from '@playwright/test';
import {mkdir,writeFile,rm,cp,readFile,readdir,stat,mkdtemp} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve,join,relative,isAbsolute,extname} from 'node:path';
import {tmpdir} from 'node:os';
import {createServer} from 'node:http';
const ready=async(p:any)=>expect(p.locator('#render-state')).toHaveText('Actualizado');
const root=resolve('plugins');
const distribution=resolve(process.env.MERMAID_BP_OUT_DIR||'dist');
async function remove(folder:string,parent:string){const rel=relative(parent,folder);if(!rel||rel.startsWith('..')||isAbsolute(rel))throw Error('Fuera de la carpeta de pruebas.');await rm(folder,{recursive:true,force:true});}
test('copiar un mod JavaScript mientras la web funciona lo descubre al recargar; retirarlo elimina su acción',async({page})=>{
 const id='test-drop-mod',folder=join(root,id);if(existsSync(folder))throw Error('La carpeta de prueba ya existe.');
 await page.goto('/');await ready(page);await expect(page.locator('#plugin-test-drop-mod-hello')).toHaveCount(0);
 try{
  await mkdir(folder);await writeFile(join(folder,'plugin.json'),JSON.stringify({id,name:'Mod de prueba',description:'Instalación por carpeta',version:'1.0.0',apiVersion:1}));
  await writeFile(join(folder,'index.js'),`export default {setup(ctx){ctx.ui.addAction({id:'hello',label:'Mod de prueba',run(){ctx.ui.notify('El mod funciona.');}});}};`);
  expect(existsSync(resolve('dist/plugins',id))).toBe(false);
  await page.reload();await ready(page);await command(page,'plugin-test-drop-mod-hello');await expect(page.locator('#message')).toHaveText('El mod funciona.');
  await command(page,'plugins-button');await page.getByRole('checkbox',{name:'Activar Mod de prueba'}).uncheck();await page.locator('#plugins-close').click();await expect(page.locator('#plugin-test-drop-mod-hello')).toHaveCount(0);
  await page.reload();await ready(page);await expect(page.locator('#plugin-test-drop-mod-hello')).toHaveCount(0);
  await command(page,'plugins-button');await page.getByRole('checkbox',{name:'Activar Mod de prueba'}).check();await page.locator('#plugins-close').click();await expect(page.locator('#plugin-test-drop-mod-hello')).toHaveCount(1);
 }finally{await remove(folder,root);}
 await page.reload();await ready(page);await expect(page.locator('#plugin-test-drop-mod-hello')).toHaveCount(0);await expect(page.locator('#plugin-bookstack-preview')).toHaveCount(1);
});
test('un mod con manifiesto inválido no bloquea el editor ni los otros plugins',async({page})=>{
 const folder=join(root,'test-broken-mod');if(existsSync(folder))throw Error('La carpeta de prueba ya existe.');
 try{await mkdir(folder);await writeFile(join(folder,'plugin.json'),'json incorrecto');await page.goto('/');await ready(page);await expect(page.locator('#plugin-bookstack-preview')).toHaveCount(1);await command(page,'plugins-button');await expect(page.locator('#plugin-list')).toContainText('test-broken-mod');}finally{await remove(folder,root);}
});
test('un plugin del contrato público funciona en una distribución compilada y aísla paquetes defectuosos',async({page})=>{
 const folder=await mkdtemp(join(tmpdir(),'mermaid-contract-'));await cp(join(distribution,'assets'),join(folder,'assets'),{recursive:true});await cp(join(distribution,'index.html'),join(folder,'index.html'));await mkdir(join(folder,'plugins'));
 const types:Record<string,string>={'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.woff2':'font/woff2','.svg':'image/svg+xml'};
 const server=createServer(async(req,res)=>{try{const path=decodeURIComponent(new URL(req.url!,'http://localhost').pathname);const file=resolve(folder,'.'+(path==='/'?'/index.html':path));const rel=relative(folder,file);if(rel.startsWith('..')||isAbsolute(rel)){res.writeHead(403).end();return;}res.setHeader('Cache-Control','no-store');
  if(path==='/plugins/'){const entries=await readdir(file,{withFileTypes:true});res.setHeader('Content-Type','application/json');res.end(JSON.stringify(entries.filter(e=>e.isDirectory()).map(e=>({type:'directory',name:e.name}))));return;}
  if(!(await stat(file)).isFile())throw Error();res.setHeader('Content-Type',types[extname(file)]??'application/octet-stream');res.end(await readFile(file));
 }catch{res.writeHead(404).end();}});
 await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));const address=server.address() as {port:number},url=`http://127.0.0.1:${address.port}`;
 try{
  await page.goto(url);await ready(page);await expect(page.locator('#plugin-actions')).toBeEmpty();
  await cp(resolve('examples/plugin-contract'),join(folder,'plugins/contract-example'),{recursive:true});
  await mkdir(join(folder,'plugins/test-broken-manifest'));await writeFile(join(folder,'plugins/test-broken-manifest/plugin.json'),'not json');
  await mkdir(join(folder,'plugins/test-invalid-entry'));await writeFile(join(folder,'plugins/test-invalid-entry/plugin.json'),JSON.stringify({id:'test-invalid-entry',name:'Entrada inválida',description:'Prueba',version:'1.0.0',apiVersion:1,entry:'../outside.js'}));
  await mkdir(join(folder,'plugins/test-missing-entry'));await writeFile(join(folder,'plugins/test-missing-entry/plugin.json'),JSON.stringify({id:'test-missing-entry',name:'Archivo ausente',description:'Prueba',version:'1.0.0',apiVersion:1,entry:'missing.js'}));
  await mkdir(join(folder,'plugins/test-incompatible-api'));await writeFile(join(folder,'plugins/test-incompatible-api/plugin.json'),JSON.stringify({id:'test-incompatible-api',name:'API futura',description:'Prueba',version:'1.0.0',apiVersion:2,enabledByDefault:false}));await writeFile(join(folder,'plugins/test-incompatible-api/index.js'),`export default {setup(){}};`);
  await mkdir(join(folder,'plugins/test-invalid-enabled-by-default'));await writeFile(join(folder,'plugins/test-invalid-enabled-by-default/plugin.json'),JSON.stringify({id:'test-invalid-enabled-by-default',name:'Preferencia inválida',description:'Prueba',version:'1.0.0',apiVersion:1,enabledByDefault:'false'}));
  await mkdir(join(folder,'plugins/test-broken-activation'));await writeFile(join(folder,'plugins/test-broken-activation/plugin.json'),JSON.stringify({id:'test-broken-activation',name:'Activación defectuosa',description:'Prueba',version:'1.0.0',apiVersion:1}));await writeFile(join(folder,'plugins/test-broken-activation/index.js'),`export default {setup(editor){editor.ui.addAction({id:'partial',label:'No debe quedar'});throw Error('Fallo de prueba');}};`);
  await page.reload();await ready(page);await expect(page.locator('#plugin-contract-example-show')).toHaveCount(1);
  const resource=page.locator('#plugin-contract-example-resource');await expect(resource).toHaveCount(1);const resourceHref=await resource.getAttribute('href');expect(resourceHref).toBe(url+'/plugins/contract-example/resource.html');const resourceResponse=await page.request.get(resourceHref!);expect(resourceResponse.ok()).toBe(true);expect(await resourceResponse.text()).toContain('Este recurso pertenece al paquete del plugin.');
  await expect(page.locator('#plugin-test-broken-activation-partial')).toHaveCount(0);
  await command(page,'plugin-contract-example-show');await expect(page.locator('#message')).toContainText('Líneas:');
  const editor=page.getByRole('textbox',{name:'Código Mermaid'});await editor.click();await editor.press('ControlOrMeta+a');await page.keyboard.insertText('flowchart TD\nA-->B\nB-->C');await ready(page);await expect(page.locator('#message')).toContainText('Documento actualizado:');
  await command(page,'tour-button');for(let i=0;i<4;i++)await page.locator('#tour-next').click();await expect(page.locator('#tour-title')).toHaveText('Plugin de contrato público');await page.locator('#tour-close').click();
  await command(page,'plugins-button');await expect(page.locator('#plugin-list')).toContainText('test-broken-manifest');await expect(page.locator('#plugin-list')).toContainText('JSON válido');await expect(page.locator('#plugin-list')).toContainText('test-invalid-entry');await expect(page.locator('#plugin-list')).toContainText('ruta de entrada');await expect(page.locator('#plugin-list')).toContainText('test-missing-entry');await expect(page.locator('#plugin-list')).toContainText('archivo de entrada');await expect(page.locator('#plugin-list')).toContainText('test-invalid-enabled-by-default');await expect(page.locator('#plugin-list')).toContainText('enabledByDefault debe ser booleano');await expect(page.locator('[data-plugin-status="test-incompatible-api"]')).toContainText('incompatible');await expect(page.locator('[data-plugin-status="test-broken-activation"]')).toContainText('No se pudo activar');
  await page.getByRole('checkbox',{name:'Activar Plugin de contrato público'}).uncheck();await page.locator('#plugins-close').click();await expect(page.locator('#plugin-contract-example-show')).toHaveCount(0);
  await command(page,'tour-button');for(let i=0;i<4;i++)await page.locator('#tour-next').click();await expect(page.locator('#tour-title')).toHaveText('Extensiones y archivos');await expect(page.locator('#tour-progress')).toHaveText('Paso 5 de 5');await page.locator('#tour-close').click();
  const lastMessage=await page.locator('#message').innerText();expect(lastMessage).toBe('Plugin de contrato público desactivado.');await editor.click();await editor.press('ControlOrMeta+a');await page.keyboard.insertText('flowchart LR\nC-->D');await ready(page);await expect(page.locator('#message')).toHaveText(lastMessage);await expect(page.locator('#diagram svg')).toHaveCount(1);
  await remove(join(folder,'plugins/contract-example'),join(folder,'plugins'));await page.goto(url);await ready(page);await expect(page.locator('#plugin-actions')).toBeEmpty();
 }finally{await new Promise<void>((done,reject)=>server.close(error=>error?reject(error):done()));await remove(folder,tmpdir());}
});
test('BookStack es un paquete autónomo que se añade y retira de una distribución ya construida',async({page})=>{
 const folder=await mkdtemp(join(tmpdir(),'mermaid-mods-'));await cp(join(distribution,'assets'),join(folder,'assets'),{recursive:true});await cp(join(distribution,'index.html'),join(folder,'index.html'));await mkdir(join(folder,'plugins'));
 const types:Record<string,string>={'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.woff2':'font/woff2','.svg':'image/svg+xml'};
 const server=createServer(async(req,res)=>{try{const path=decodeURIComponent(new URL(req.url!,'http://localhost').pathname);const file=resolve(folder,'.'+(path==='/'?'/index.html':path));const rel=relative(folder,file);if(rel.startsWith('..')||isAbsolute(rel)){res.writeHead(403).end();return;}res.setHeader('Cache-Control','no-store');
  if(path==='/plugins/'){const entries=await readdir(file,{withFileTypes:true});res.setHeader('Content-Type','application/json');res.end(JSON.stringify(entries.filter(e=>e.isDirectory()).map(e=>({type:'directory',name:e.name}))));return;}
  if(!(await stat(file)).isFile())throw Error();res.setHeader('Content-Type',types[extname(file)]??'application/octet-stream');res.end(await readFile(file));
 }catch{res.writeHead(404).end();}});
 await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));const address=server.address() as {port:number},url=`http://127.0.0.1:${address.port}`;
 try{
  await page.goto(url);await ready(page);await expect(page.locator('#plugin-actions')).toBeEmpty();
  await cp(join(distribution,'plugins/bookstack'),join(folder,'plugins/bookstack'),{recursive:true});await page.reload();await ready(page);const preview=page.locator('#plugin-bookstack-preview');await expect(preview).toHaveCount(1);
  const previewPromise=page.context().waitForEvent('page');await command(page,'plugin-bookstack-preview');const bookstack=await previewPromise;await bookstack.waitForLoadState();await expect(bookstack.locator('#check-output svg')).toHaveCount(1);await expect(bookstack.locator('#check-state')).toContainText('Renderizado con Mermaid');

  expect(await bookstack.locator('.check-layout>header>a').first().getAttribute('href')).toBe(url+'/');
  const header=await page.request.get(url+'/plugins/bookstack/bookstack-header.html');expect(header.ok()).toBe(true);expect(await header.text()).toContain('<script type="module">');
  await remove(join(folder,'plugins/bookstack'),join(folder,'plugins'));await page.goto(url);await ready(page);await expect(page.locator('#plugin-actions')).toBeEmpty();
 }finally{await new Promise<void>((done,reject)=>server.close(error=>error?reject(error):done()));await remove(folder,tmpdir());}
});
test('la distribución web permite al administrador cambiar carpetas sin recompilar y solo admite lectura para usuarios',async({page})=>{
 const folder=await mkdtemp(join(tmpdir(),'mermaid-web-admin-')),plugin=join(folder,'plugins/admin-plugin');
 await cp(join(distribution,'assets'),join(folder,'assets'),{recursive:true});await cp(join(distribution,'index.html'),join(folder,'index.html'));await mkdir(join(folder,'plugins'));
 const types:Record<string,string>={'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.woff2':'font/woff2','.svg':'image/svg+xml'};
 const server=createServer(async(req,res)=>{if(!['GET','HEAD'].includes(req.method??'')){res.writeHead(405).end();return;}try{const path=decodeURIComponent(new URL(req.url!,'http://localhost').pathname);const file=resolve(folder,'.'+(path==='/'?'/index.html':path));const rel=relative(folder,file);if(rel.startsWith('..')||isAbsolute(rel)){res.writeHead(403).end();return;}res.setHeader('Cache-Control','no-store');
  if(path==='/plugins/'){const entries=await readdir(file,{withFileTypes:true});res.setHeader('Content-Type','application/json');res.end(JSON.stringify(entries.filter(e=>e.isDirectory()).map(e=>({type:'directory',name:e.name}))));return;}
  if(!(await stat(file)).isFile())throw Error();res.setHeader('Content-Type',types[extname(file)]??'application/octet-stream');res.end(await readFile(file));
 }catch{res.writeHead(404).end();}});
 await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));const address=server.address() as {port:number},url=`http://127.0.0.1:${address.port}`;
 try{
  const staticConfig=await readFile(resolve('deploy/nginx/mermaid-bp-static.conf'),'utf8');expect(staticConfig).toMatch(/if \(\$request_method !~ \^\(GET\|HEAD\)\$\) \{ return 405; \}/);
  await page.goto(url);await ready(page);await command(page,'plugins-button');
  await expect(page.locator('#plugins-dialog input[type=file],#plugins-dialog form,#plugins-dialog button')).toHaveCount(0);
  await page.locator('#plugins-close').click();
  for(const method of ['POST','PUT','DELETE'])expect((await page.request.fetch(url+'/plugins/admin-plugin/plugin.json',{method, data:'{}'})).status()).toBe(405);
  expect((await page.request.get(url+'/plugins/admin-plugin/plugin.json')).status()).toBe(404);expect(existsSync(plugin)).toBe(false);

  await mkdir(plugin);await writeFile(join(plugin,'plugin.json'),JSON.stringify({id:'admin-plugin',name:'Extensión de servidor',description:'Administrada por el servidor',version:'1.0.0',apiVersion:1}));
  await writeFile(join(plugin,'index.js'),`export default {setup(ctx){ctx.ui.addAction({id:'hello',label:'Versión 1',run(){ctx.ui.notify('Versión 1');}});}};`);
  await page.reload();await ready(page);await command(page,'plugins-button');const toggle=page.getByRole('checkbox',{name:'Activar Extensión de servidor'});await expect(toggle).toBeChecked();await toggle.uncheck();await page.locator('#plugins-close').click();await expect(page.locator('#plugin-admin-plugin-hello')).toHaveCount(0);
  await page.reload();await ready(page);await command(page,'plugins-button');await expect(toggle).not.toBeChecked();await toggle.check();await page.locator('#plugins-close').click();await expect(page.locator('#plugin-admin-plugin-hello')).toHaveCount(1);
  await command(page,'plugin-admin-plugin-hello');await expect(page.locator('#message')).toHaveText('Versión 1');
  await writeFile(join(plugin,'plugin.json'),JSON.stringify({id:'admin-plugin',name:'Extensión actualizada',description:'Administrada por el servidor',version:'2.0.0',apiVersion:1}));
  await writeFile(join(plugin,'index.js'),`export default {setup(ctx){ctx.ui.addAction({id:'hello',label:'Versión 2',run(){ctx.ui.notify('Versión 2');}});}};`);
  await page.reload();await ready(page);await expect(page.locator('#plugin-admin-plugin-hello')).toHaveText('Versión 2');await command(page,'plugin-admin-plugin-hello');await expect(page.locator('#message')).toHaveText('Versión 2');
  await command(page,'plugins-button');await expect(page.locator('#plugin-list')).toContainText('2.0.0');await page.locator('#plugins-close').click();
  await remove(plugin,join(folder,'plugins'));await page.reload();await ready(page);await expect(page.locator('#plugin-admin-plugin-hello')).toHaveCount(0);await command(page,'plugins-button');await expect(page.locator('#plugin-list')).toContainText('no incluye extensiones');
 }finally{await new Promise<void>((done,reject)=>server.close(error=>error?reject(error):done()));await remove(folder,tmpdir());}
});
