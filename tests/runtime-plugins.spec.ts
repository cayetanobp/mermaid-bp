import {test,expect} from '@playwright/test';
import {mkdir,writeFile,rm,cp,readFile,readdir,stat,mkdtemp} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve,join,relative,isAbsolute,extname} from 'node:path';
import {tmpdir} from 'node:os';
import {createServer} from 'node:http';
const ready=async(p:any)=>expect(p.locator('#render-state')).toHaveText('Actualizado');
const root=resolve('plugins');
async function remove(folder:string,parent:string){const rel=relative(parent,folder);if(!rel||rel.startsWith('..')||isAbsolute(rel))throw Error('Fuera de la carpeta de pruebas.');await rm(folder,{recursive:true,force:true});}
test('copiar un mod JavaScript mientras la web funciona lo descubre al recargar; retirarlo elimina su acción',async({page})=>{
 const id='test-drop-mod',folder=join(root,id);if(existsSync(folder))throw Error('La carpeta de prueba ya existe.');
 await page.goto('/');await ready(page);await expect(page.locator('#plugin-test-drop-mod-hello')).toHaveCount(0);
 try{
  await mkdir(folder);await writeFile(join(folder,'plugin.json'),JSON.stringify({id,name:'Mod de prueba',description:'Instalación por carpeta',version:'1.0.0',apiVersion:1}));
  await writeFile(join(folder,'index.js'),`export default {setup(ctx){ctx.ui.addAction({id:'hello',label:'Mod de prueba',run(){ctx.ui.notify('El mod funciona.');}});}};`);
  expect(existsSync(resolve('dist/plugins',id))).toBe(false);
  await page.reload();await ready(page);await page.locator('#plugin-test-drop-mod-hello').click();await expect(page.locator('#message')).toHaveText('El mod funciona.');
  await page.locator('#plugins-button').click();await page.getByRole('checkbox',{name:'Activar Mod de prueba'}).uncheck();await page.locator('#plugins-close').click();await expect(page.locator('#plugin-test-drop-mod-hello')).toHaveCount(0);
  await page.reload();await ready(page);await expect(page.locator('#plugin-test-drop-mod-hello')).toHaveCount(0);
  await page.locator('#plugins-button').click();await page.getByRole('checkbox',{name:'Activar Mod de prueba'}).check();await page.locator('#plugins-close').click();await expect(page.locator('#plugin-test-drop-mod-hello')).toBeVisible();
 }finally{await remove(folder,root);}
 await page.reload();await ready(page);await expect(page.locator('#plugin-test-drop-mod-hello')).toHaveCount(0);await expect(page.locator('#plugin-bookstack-preview')).toBeVisible();
});
test('un mod con manifiesto inválido no bloquea el editor ni los otros plugins',async({page})=>{
 const folder=join(root,'test-broken-mod');if(existsSync(folder))throw Error('La carpeta de prueba ya existe.');
 try{await mkdir(folder);await writeFile(join(folder,'plugin.json'),'json incorrecto');await page.goto('/');await ready(page);await expect(page.locator('#plugin-bookstack-preview')).toBeVisible();await page.locator('#plugins-button').click();await expect(page.locator('#plugin-list')).toContainText('test-broken-mod');}finally{await remove(folder,root);}
});
test('BookStack es un paquete autónomo que se añade y retira de una distribución ya construida',async({page})=>{
 const folder=await mkdtemp(join(tmpdir(),'mermaid-mods-'));await cp(resolve('dist/assets'),join(folder,'assets'),{recursive:true});await cp(resolve('dist/index.html'),join(folder,'index.html'));await mkdir(join(folder,'plugins'));
 const types:Record<string,string>={'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.woff2':'font/woff2','.svg':'image/svg+xml'};
 const server=createServer(async(req,res)=>{try{const path=decodeURIComponent(new URL(req.url!,'http://localhost').pathname);const file=resolve(folder,'.'+(path==='/'?'/index.html':path));const rel=relative(folder,file);if(rel.startsWith('..')||isAbsolute(rel)){res.writeHead(403).end();return;}res.setHeader('Cache-Control','no-store');
  if(path==='/plugins/'){const entries=await readdir(file,{withFileTypes:true});res.setHeader('Content-Type','application/json');res.end(JSON.stringify(entries.filter(e=>e.isDirectory()).map(e=>({type:'directory',name:e.name}))));return;}
  if(!(await stat(file)).isFile())throw Error();res.setHeader('Content-Type',types[extname(file)]??'application/octet-stream');res.end(await readFile(file));
 }catch{res.writeHead(404).end();}});
 await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));const address=server.address() as {port:number},url=`http://127.0.0.1:${address.port}`;
 try{
  await page.goto(url);await ready(page);await expect(page.locator('#plugin-actions')).toBeEmpty();
  await cp(resolve('dist/plugins/bookstack'),join(folder,'plugins/bookstack'),{recursive:true});await page.reload();await ready(page);const link=page.locator('#plugin-bookstack-preview');await expect(link).toBeVisible();const href=await link.getAttribute('href');expect(href).toBe(url+'/plugins/bookstack/bookstack.html');
  await page.goto(href!);await expect(page.locator('#check-output svg')).toHaveCount(1);await expect(page.locator('#check-state')).toContainText('Renderizado con Mermaid');
  expect(await page.locator('.check-layout>header>a').first().getAttribute('href')).toBe(url+'/');
  const header=await page.request.get(url+'/plugins/bookstack/bookstack-header.html');expect(header.ok()).toBe(true);expect(await header.text()).toContain('<script type="module">');
  await remove(join(folder,'plugins/bookstack'),join(folder,'plugins'));await page.goto(url);await ready(page);await expect(page.locator('#plugin-actions')).toBeEmpty();
 }finally{await new Promise<void>((done,reject)=>server.close(error=>error?reject(error):done()));await remove(folder,tmpdir());}
});
