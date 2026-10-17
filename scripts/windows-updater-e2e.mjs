import {createServer} from 'node:http';
import {spawn,spawnSync} from 'node:child_process';
import {mkdtemp,readFile,writeFile,mkdir,readdir,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,basename,dirname} from 'node:path';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium,expect} from '@playwright/test';

const root=process.cwd();
const desktop=join(root,'desktop-app');
const bundle=join(desktop,'src-tauri','target','release','bundle','nsis');
const config=JSON.parse(await readFile(join(desktop,'src-tauri','tauri.conf.json'),'utf8'));
const targetVersion=config.version;
const baseVersion='0.1.0';
const key=process.env.TAURI_SIGNING_PRIVATE_KEY;
if(!key?.trim())throw Error('Falta TAURI_SIGNING_PRIVATE_KEY; se cancela la validación nativa del updater.');
if(!(targetVersion>baseVersion))throw Error(`La versión candidata ${targetVersion} debe ser posterior a ${baseVersion}.`);

const scratch=await mkdtemp(join(tmpdir(),'mermaid-bp-updater-e2e-'));
const pluginFolder=join(scratch,'updater-persistence-test');
const documentPath=join(scratch,'actualizacion.mmd');
const document='flowchart LR\nA["Documento conservado"] --> B["Sigue disponible"]\n';
await mkdir(pluginFolder);
await writeFile(documentPath,document);
await writeFile(join(pluginFolder,'plugin.json'),JSON.stringify({id:'updater-persistence-test',name:'Plugin persistente',description:'Comprueba que las extensiones locales sobreviven a una actualización.',version:'1.0.0',apiVersion:1,enabledByDefault:true,entry:'index.js'}));
await writeFile(join(pluginFolder,'index.js'),`export default {setup(context){context.ui.addAction({id:'alive',label:'Plugin persistente activo',run(){}});}};\n`);

let mode='none';
let updateInstaller='';
let updateSignature='';
const server=createServer(async(req,res)=>{
  const pathname=new URL(req.url??'/',`http://127.0.0.1`).pathname;
  if(pathname==='/latest.json'){
    if(mode==='offline'){res.writeHead(503,{'cache-control':'no-store'});res.end('Feed temporalmente no disponible');return;}
    const manifest={version:mode==='none'?baseVersion:targetVersion,notes:'Validación privada de actualización Windows.',pub_date:'2026-10-17T00:00:00Z',platforms:{'windows-x86_64':{signature:mode==='bad-signature'?'invalid updater signature':updateSignature,url:`http://127.0.0.1:${server.address().port}/candidate.exe`}}};
    res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(manifest));return;
  }
  if(pathname==='/candidate.exe'&&updateInstaller){
    const bytes=await readFile(updateInstaller);res.writeHead(200,{'content-type':'application/octet-stream','content-length':bytes.length,'cache-control':'no-store'});res.end(bytes);return;
  }
  res.writeHead(404);res.end('Not found');
});
await new Promise((resolveListen,reject)=>server.once('error',reject).listen(0,'127.0.0.1',resolveListen));
const endpoint=`http://127.0.0.1:${server.address().port}/latest.json`;

function run(command,args,options={}){
  const result=spawnSync(command,args,{cwd:options.cwd??root,env:options.env??process.env,encoding:'utf8',windowsHide:true,maxBuffer:16*1024*1024});
  const output=(result.stdout??'')+(result.stderr??'');
  const safe=key?output.split(key).join('[redacted signing key]'):output;
  if(result.error){if(safe)process.stderr.write(safe);throw Error(`${command} no se pudo iniciar (${result.error.code??'error de proceso'}).`);}
  if(result.status!==0){if(safe)process.stderr.write(safe);throw Error(`${command} terminó con código ${result.status??result.signal}.`);}
  if(safe)process.stdout.write(safe);
  return result.stdout??'';
}

async function build(version,tag){
  const overlay=join(scratch,`${tag}.json`);
  await writeFile(overlay,JSON.stringify({version,plugins:{updater:{endpoints:[endpoint],dangerousInsecureTransportProtocol:true}}}));
  const npmCli=process.env.npm_execpath??join(dirname(process.execPath),'node_modules','npm','bin','npm-cli.js');
  await stat(npmCli);
  run(process.execPath,[npmCli,'exec','--','tauri','build','--config',overlay,'--','--locked'],{cwd:desktop,env:{...process.env,npm_execpath:npmCli,TAURI_SIGNING_PRIVATE_KEY:key,TAURI_SIGNING_PRIVATE_KEY_PASSWORD:''}});
  const files=await readdir(bundle);
  const installers=files.filter(name=>name.endsWith('-setup.exe'));
  if(installers.length!==1)throw Error(`La compilación ${tag} debía producir un solo instalador NSIS firmado; se encontraron ${installers.length}.`);
  const installer=join(bundle,installers[0]),signature=installer+'.sig';
  const signatureText=(await readFile(signature,'utf8')).trim();
  if(!signatureText)throw Error(`El instalador updater ${basename(installer)} no tiene firma.`);
  return{installer,signature,signatureText,files:[installer,signature]};
}

function installBase(installer){
  const result=spawnSync(installer,['/S'],{cwd:scratch,encoding:'utf8',windowsHide:true,timeout:180000});
  if(result.status!==0)throw Error(`El instalador base NSIS no terminó correctamente (${result.status??result.signal}).`);
}

async function findInstalledExecutable(){
  const localAppData=process.env.LOCALAPPDATA??'';
  const possible=['Programs/Mermaid BP','Mermaid BP','Programs/mermaid-bp-desktop','mermaid-bp-desktop']
    .flatMap(folder=>['mermaid-bp-desktop.exe','Mermaid BP.exe'].map(name=>join(localAppData,folder,name)));
  for(const candidate of possible)try{await stat(candidate);return candidate;}catch{}
  throw Error('No se encontró mermaid-bp-desktop.exe bajo la carpeta de instalación del usuario después de ejecutar el instalador NSIS.');
}

function startApp(executable){
  return spawn(executable,[],{cwd:scratch,windowsHide:true,env:{...process.env,WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:'--remote-debugging-port=9222'}});
}

async function attachApp(){
  const deadline=Date.now()+120000;
  let lastError;
  while(Date.now()<deadline){
    let browser;
    try{
      browser=await chromium.connectOverCDP('http://127.0.0.1:9222',{timeout:3000});
      for(const context of browser.contexts())for(const page of context.pages())if(page.url().includes('tauri.localhost')||page.url().startsWith('tauri://')){
        await page.locator('#render-state').waitFor({state:'visible',timeout:30000});
        return{browser,page};
      }
      lastError=Error('WebView2 no publicó la ventana principal de Mermaid BP.');
      await browser.close();
    }catch(error){lastError=error;try{await browser?.close();}catch{}}
    await delay(1000);
  }
  throw Error(`No se pudo conectar Playwright al WebView2 de la aplicación instalada: ${lastError instanceof Error?lastError.message:String(lastError)}`);
}

async function waitForAppExit(child){
  if(child.exitCode!==null||child.signalCode!==null)return;
  await Promise.race([
    once(child,'exit'),
    delay(120000).then(()=>{throw Error('La aplicación instalada no salió para completar la actualización de Windows.');}),
  ]);
}

async function openSettings(page,section='General'){
  await page.locator('#menu-configuracion').click();
  await page.locator('#settings-button').click();
  await page.getByRole('tab',{name:section,exact:true}).click();
}

async function openUpdater(page){await openSettings(page,'General');}
async function assertPluginAndPreference(page){
  await openSettings(page,'Editor');
  await expect(page.locator('#setting-editorFontSize')).toHaveValue('18');
  await page.getByRole('tab',{name:'Extensiones',exact:true}).click();
  await expect(page.locator('#plugin-list')).toContainText('Plugin persistente');
  await expect(page.locator('#plugin-list [data-plugin-status="updater-persistence-test"]')).toHaveText('Activo · 1.0.0');
  await expect(page.locator('#plugin-updater-persistence-test-alive')).toHaveText('Plugin persistente activo');
  await page.locator('#plugins-close').click();
}

let appProcess;
let browser;
try{
  const base=await build(baseVersion,'base');
  run('pwsh',['-NoProfile','-ExecutionPolicy','Bypass','-File',join(root,'scripts','verify-nsis-license.ps1'),'-Installer',base.installer]);
  installBase(base.installer);
  for(const file of base.files)await rm(file,{force:true});
  const candidate=await build(targetVersion,'candidate');
  updateInstaller=candidate.installer;updateSignature=candidate.signatureText;

  const executable=await findInstalledExecutable();
  appProcess=startApp(executable);
  ({browser}=await attachApp());
  let page=browser.contexts().flatMap(context=>context.pages()).find(item=>item.url().includes('tauri.localhost')||item.url().startsWith('tauri://'));
  if(!page)throw Error('La ventana de la aplicación no está disponible en WebView2.');

  await openUpdater(page);
  mode='offline';
  await page.getByRole('button',{name:'Buscar actualizaciones'}).click();
  await expect(page.getByRole('status')).toContainText('No se pudo buscar actualizaciones.',{timeout:30000});
  await expect(page.locator('.cm-content')).toBeVisible();
  mode='none';
  await page.getByRole('button',{name:'Buscar actualizaciones'}).click();
  await expect(page.getByRole('status')).toHaveText('No hay actualizaciones disponibles.');

  await page.locator('#file').setInputFiles(documentPath);
  await expect(page.locator('.cm-content')).toContainText('Documento conservado');
  await expect(page.locator('#render-state')).toHaveText('Actualizado');
  await openSettings(page,'Editor');
  await page.locator('#setting-editorFontSize').selectOption('18');
  await expect(page.locator('#settings-status')).toContainText('Cambios guardados');
  await page.locator('#settings-tab-extensions').click();
  await page.locator('#plugin-folder-input').setInputFiles(pluginFolder);
  await expect(page.locator('#plugin-install')).toBeVisible();
  await page.locator('#plugin-trust-confirm').check();
  await page.locator('#plugin-install').click();
  await expect(page.locator('#plugin-local-status')).toContainText('instalado o actualizado');
  await expect(page.locator('#plugin-updater-persistence-test-alive')).toHaveText('Plugin persistente activo');
  await page.locator('#plugins-close').click();

  mode='bad-signature';
  await openUpdater(page);
  await page.getByRole('button',{name:'Buscar actualizaciones'}).click();
  await expect(page.getByText(`Nueva versión: ${targetVersion}`)).toBeVisible();
  await page.getByRole('button',{name:'Descargar e instalar'}).click();
  await expect(page.getByRole('status')).toContainText('No se pudo instalar la actualización.',{timeout:120000});
  await expect(page.locator('.cm-content')).toContainText('Documento conservado');
  await assertPluginAndPreference(page);
  await openUpdater(page);
  await expect(page.getByText(`Versión instalada: ${baseVersion}`)).toBeVisible();

  mode='candidate';
  await page.getByRole('button',{name:'Buscar actualizaciones'}).click();
  await expect(page.getByText(`Nueva versión: ${targetVersion}`)).toBeVisible();
  await page.getByText('Validación privada de actualización Windows.').waitFor();
  try{await page.getByRole('button',{name:'Descargar e instalar'}).click({noWaitAfter:true});}catch{}
  await waitForAppExit(appProcess);
  try{await browser.close();}catch{}
  browser=undefined;
  ({browser,page}=await attachApp());
  await openUpdater(page);
  await page.getByRole('button',{name:'Buscar actualizaciones'}).click();
  await expect(page.getByRole('status')).toHaveText('No hay actualizaciones disponibles.',{timeout:120000});
  await expect(page.getByText(`Versión instalada: ${targetVersion}`)).toBeVisible();

  await page.locator('#file').setInputFiles(documentPath);
  await expect(page.locator('.cm-content')).toContainText('Documento conservado');
  await assertPluginAndPreference(page);
  await expect(page.locator('#plugin-updater-persistence-test-alive')).toHaveText('Plugin persistente activo');
  process.stdout.write(`Validación nativa completada: ${baseVersion} -> ${targetVersion}; la firma inválida se rechazó, el instalador firmado se aplicó y el WebView2 reabrió con documento, preferencias y plugin locales disponibles.\n`);
  const windowClosed=page.waitForEvent('close',{timeout:15000});
  await page.keyboard.press('Alt+F4');
  await windowClosed;
}finally{
  try{await browser?.close();}catch{}
  if(appProcess&&!appProcess.killed){try{appProcess.kill();}catch{}}
  await new Promise(resolveClose=>server.close(()=>resolveClose()));
  await rm(scratch,{recursive:true,force:true});
}
