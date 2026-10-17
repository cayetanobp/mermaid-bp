import {createServer} from 'node:http';
import {spawn,spawnSync} from 'node:child_process';
import {createWriteStream} from 'node:fs';
import {mkdtemp,readFile,writeFile,mkdir,readdir,rm,stat,statfs} from 'node:fs/promises';
import {createHash} from 'node:crypto';
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
const diagnostics=await mkdtemp(join(process.env.RUNNER_TEMP??tmpdir(),'mermaid-bp-windows-updater-e2e-'));
const diagnosticLog=createWriteStream(join(diagnostics,'native-process.log'),{flags:'a'});
const processQuery=join(diagnostics,'find-app-processes.ps1');
const screenCapture=join(diagnostics,'capture-desktop.ps1');
await writeFile(processQuery,`param([Parameter(Mandatory=$true)][string]$ExecutablePath)
$ErrorActionPreference = 'Stop'
Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and [string]::Equals($_.ExecutablePath, $ExecutablePath, [System.StringComparison]::OrdinalIgnoreCase) } | ForEach-Object { $_.ProcessId }
`);
await writeFile(screenCapture,`param([Parameter(Mandatory=$true)][string]$OutputPath)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bitmap = [System.Drawing.Bitmap]::new($bounds.Width, $bounds.Height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
try { $graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size); $bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png) }
finally { $graphics.Dispose(); $bitmap.Dispose() }
`);
const pluginFolder=join(scratch,'updater-persistence-test');
const documentPath=join(scratch,'actualizacion.mmd');
const document='flowchart LR\nA["Documento conservado"] --> B["Sigue disponible"]\n';
await mkdir(pluginFolder);
await writeFile(documentPath,document);
await writeFile(join(pluginFolder,'plugin.json'),JSON.stringify({id:'updater-persistence-test',name:'Plugin persistente',description:'Comprueba que las extensiones locales sobreviven a una actualización.',version:'1.0.0',apiVersion:1,enabledByDefault:true,entry:'index.js'}));
await writeFile(join(pluginFolder,'index.js'),`export default {setup(context){context.ui.addAction({id:'alive',label:'Plugin persistente activo',run(){}});}};\n`);

let mode='none';
let phase='preflight';
let updateInstaller='';
let updateSignature='';
let installedExecutable='';
let primaryError;
let appProcess;
let browser;
const spawnedAppPids=new Set();
const server=createServer(async(req,res)=>{
  const pathname=new URL(req.url??'/',`http://127.0.0.1`).pathname;
  diagnosticLog.write(`[feed] ${req.method} ${pathname} mode=${mode}\n`);
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
  if(result.error){if(safe){process.stderr.write(safe);diagnosticLog.write(safe);}throw Error(`${command} no se pudo iniciar (${result.error.code??'error de proceso'}).`);}
  if(result.status!==0){if(safe){process.stderr.write(safe);diagnosticLog.write(safe);}throw Error(`${command} terminó con código ${result.status??result.signal}.`);}
  if(safe){process.stdout.write(safe);diagnosticLog.write(safe);}
  return result.stdout??'';
}

async function preflight(){
  const npmCli=process.env.npm_execpath??join(dirname(process.execPath),'node_modules','npm','bin','npm-cli.js');
  await stat(npmCli);
  const tauriCli=join(desktop,'node_modules','@tauri-apps','cli','tauri.js');
  await stat(tauriCli);
  const volumes=[...new Set([root,desktop,tmpdir()])];
  const disk=[];
  for(const location of volumes){
    const info=await statfs(location);
    const availableBytes=info.bavail*info.bsize;
    disk.push({location,availableBytes});
    if(availableBytes<3*1024**3)throw Error(`Espacio libre insuficiente para dos compilaciones Windows: ${Math.floor(availableBytes/1024**3)} GiB en ${location}.`);
  }
  const webviewRoots=['PROGRAMFILES(X86)','PROGRAMFILES'].filter(name=>process.env[name]).map(name=>join(process.env[name],'Microsoft','EdgeWebView','Application'));
  let webviewRuntime='';
  for(const location of webviewRoots){
    let versions=[];try{versions=await readdir(location);}catch{}
    for(const version of versions){
      const candidate=join(location,version,'msedgewebview2.exe');
      try{await stat(candidate);webviewRuntime=candidate;break;}catch{}
    }
    if(webviewRuntime)break;
  }
  if(!webviewRuntime)throw Error('No se encontró el runtime de WebView2 requerido por la aplicación instalada.');
  const powershell=run('pwsh',['-NoProfile','-Command','$PSVersionTable.PSVersion.ToString()']).trim();
  const details={node:process.version,powershell,npmCli,tauriCli,webviewRuntime,cargoHome:process.env.CARGO_HOME??null,targetDirectory:join(desktop,'src-tauri','target'),disk};
  diagnosticLog.write(`[preflight] ${JSON.stringify(details)}\n`);
  process.stdout.write(`[preflight] Node ${details.node}; PowerShell ${powershell}; WebView2 disponible; espacio libre comprobado.\n`);
}

function observePage(page){
  page.on('console',message=>diagnosticLog.write(`[webview:${message.type()}] ${message.text()}\n`));
  page.on('pageerror',error=>diagnosticLog.write(`[webview:pageerror] ${error.stack??error.message}\n`));
  page.on('requestfailed',request=>diagnosticLog.write(`[webview:requestfailed] ${request.url()} ${request.failure()?.errorText??''}\n`));
}

async function captureFailure(error){
  if(installedExecutable){try{for(const pid of runningAppPids(installedExecutable))spawnedAppPids.add(pid);}catch(processError){diagnosticLog.write(`[capture:processes] ${processError.stack??processError.message}\n`);}}
  const details={phase,mode,baseVersion,targetVersion,installedExecutable,spawnedAppPids:Array.from(spawnedAppPids),error:error instanceof Error?error.stack??error.message:String(error)};
  await writeFile(join(diagnostics,'failure.json'),JSON.stringify(details,null,2));
  const page=browser?.contexts().flatMap(context=>context.pages())[0];
  if(page){
    try{await page.screenshot({path:join(diagnostics,'webview-failure.png'),fullPage:true,timeout:10000});}catch(captureError){diagnosticLog.write(`[capture:webview] ${captureError.message}\n`);}
    try{await writeFile(join(diagnostics,'webview-state.txt'),`URL: ${page.url()}\nTitle: ${await page.title()}\n\n${(await page.locator('body').innerText({timeout:5000})).slice(0,12000)}`);}catch(captureError){diagnosticLog.write(`[capture:webview-state] ${captureError.message}\n`);}
  }
  try{run('pwsh',['-NoProfile','-File',screenCapture,join(diagnostics,'desktop-failure.png')]);}catch(captureError){diagnosticLog.write(`[capture:desktop] ${captureError.stack??captureError.message}\n`);}
  process.stderr.write(`Diagnósticos del updater Windows guardados en ${diagnostics}; fase fallida: ${phase}.\n`);
}

async function build(version,tag){
  phase=`build signed ${tag} installer`;
  const overlay=join(scratch,`${tag}.json`);
  await writeFile(overlay,JSON.stringify({version,plugins:{updater:{endpoints:[endpoint],dangerousInsecureTransportProtocol:true}}}));
  const npmCli=process.env.npm_execpath??join(dirname(process.execPath),'node_modules','npm','bin','npm-cli.js');
  await stat(npmCli);
  run(process.execPath,[npmCli,'exec','--','tauri','build','--features','tauri/devtools,updater-e2e-cdp','--config',overlay,'--','--locked'],{cwd:desktop,env:{...process.env,npm_execpath:npmCli,TAURI_SIGNING_PRIVATE_KEY:key,TAURI_SIGNING_PRIVATE_KEY_PASSWORD:''}});
  const files=await readdir(bundle);
  const installers=files.filter(name=>name.endsWith('-setup.exe'));
  if(installers.length!==1)throw Error(`La compilación ${tag} debía producir un solo instalador NSIS firmado; se encontraron ${installers.length}.`);
  const installer=join(bundle,installers[0]),signature=installer+'.sig';
  const signatureText=(await readFile(signature,'utf8')).trim();
  if(!signatureText)throw Error(`El instalador updater ${basename(installer)} no tiene firma.`);
  const artifactBytes=await readFile(installer);
  diagnosticLog.write(`[artifact] ${JSON.stringify({tag,installer:basename(installer),bytes:artifactBytes.length,sha256:createHash('sha256').update(artifactBytes).digest('hex'),signatureBytes:(await stat(signature)).size})}\n`);
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
  const appEnvironment={...process.env,WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:'--remote-debugging-port=9222'};
  delete appEnvironment.TAURI_SIGNING_PRIVATE_KEY;
  delete appEnvironment.TAURI_SIGNING_PRIVATE_KEY_PASSWORD;
  const child=spawn(executable,[],{cwd:scratch,windowsHide:true,env:appEnvironment});
  if(child.pid)spawnedAppPids.add(child.pid);
  for(const [channel,stream] of [['stdout',child.stdout],['stderr',child.stderr]])stream?.on('data',chunk=>diagnosticLog.write(`[app:${channel}] ${key?chunk.toString().split(key).join('[redacted signing key]'):chunk.toString()}`));
  return child;
}

function runningAppPids(executable){
  const result=spawnSync('pwsh',['-NoProfile','-File',processQuery,executable],{cwd:root,encoding:'utf8',windowsHide:true,timeout:15000});
  if(result.error)throw Error(`No se pudieron consultar los procesos de la aplicación (${result.error.code??'error'}).`);
  if(result.status!==0)throw Error(`La consulta de procesos de la aplicación terminó con código ${result.status??result.signal}.`);
  const pids=(result.stdout??'').trim().split(/\s+/).filter(value=>/^\d+$/.test(value)).map(Number);
  diagnosticLog.write(`[processes] ${JSON.stringify({executable,pids})}\n`);
  return pids;
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
        observePage(page);
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
  const dialog=page.locator('#settings-dialog');
  if(!await dialog.evaluate(element=>element.open)){
    await page.locator('#menu-configuracion').click();
    await page.locator('#settings-button').click();
  }
  await page.getByRole('tab',{name:section,exact:true}).click();
}

async function openUpdater(page){await openSettings(page,'General');await expect(page.locator('#desktop-updates')).toBeVisible();}
async function importDocument(page,path,expectedText){
  await page.locator('#file').setInputFiles(path);
  const dialog=page.locator('#confirm-dialog');
  await expect.poll(async()=>await dialog.evaluate(element=>element.open)||((await page.locator('.cm-content').innerText()).includes(expectedText))).toBeTruthy();
  if(await dialog.evaluate(element=>element.open))await dialog.getByRole('button',{name:'Continuar sin descargar',exact:true}).click();
  await expect(page.locator('.cm-content')).toContainText(expectedText);
}
async function assertPluginAndPreference(page){
  await openSettings(page,'Editor');
  await expect(page.locator('#setting-editorFontSize')).toHaveValue('18');
  await page.getByRole('tab',{name:'Extensiones',exact:true}).click();
  await expect(page.locator('#plugin-list')).toContainText('Plugin persistente');
  await expect(page.locator('#plugin-list [data-plugin-status="updater-persistence-test"]')).toHaveText('Activo · 1.0.0');
  await expect(page.locator('#plugin-updater-persistence-test-alive')).toHaveText('Plugin persistente activo');
  await page.locator('#plugins-close').click();
}

try{
  await preflight();
  phase='build signed base installer';
  const base=await build(baseVersion,'base');
  phase='verify base installer legal resources';
  run('pwsh',['-NoProfile','-ExecutionPolicy','Bypass','-File',join(root,'scripts','verify-nsis-license.ps1'),'-Installer',base.installer]);
  phase='install base application';
  installBase(base.installer);
  for(const file of base.files)await rm(file,{force:true});
  phase='build signed candidate installer';
  const candidate=await build(targetVersion,'candidate');
  updateInstaller=candidate.installer;updateSignature=candidate.signatureText;

  const executable=await findInstalledExecutable();
  installedExecutable=executable;
  phase='check for pre-existing app processes';
  const preexistingProcesses=runningAppPids(executable);
  if(preexistingProcesses.length)throw Error(`Ya había procesos de ${basename(executable)} en ejecución antes del smoke; se cancela para no interferir con otra instancia.`);
  phase='launch base application';
  appProcess=startApp(executable);
  ({browser}=await attachApp());
  let page=browser.contexts().flatMap(context=>context.pages()).find(item=>item.url().includes('tauri.localhost')||item.url().startsWith('tauri://'));
  if(!page)throw Error('La ventana de la aplicación no está disponible en WebView2.');
  const updater=()=>page.locator('#desktop-updates');

  phase='verify unavailable updater feed';
  await openUpdater(page);
  mode='offline';
  await page.locator('#desktop-updates').getByRole('button',{name:'Buscar actualizaciones',exact:true}).click();
  await expect(page.locator('#update-status')).toContainText('No se pudo buscar actualizaciones.',{timeout:30000});
  await expect(page.locator('.cm-content')).toBeVisible();
  phase='verify current version and open local document';
  mode='none';
  await page.locator('#desktop-updates').getByRole('button',{name:'Buscar actualizaciones',exact:true}).click();
  await expect(page.locator('#update-status')).toHaveText('No hay actualizaciones disponibles.');

  await importDocument(page,documentPath,'Documento conservado');
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

  phase='verify invalid updater signature is rejected';
  mode='bad-signature';
  await openUpdater(page);
  await updater().getByRole('button',{name:'Buscar actualizaciones',exact:true}).click();
  await expect(updater().getByText(`Nueva versión: ${targetVersion}`,{exact:true})).toBeVisible();
  await updater().getByRole('button',{name:'Descargar e instalar',exact:true}).click();
  await expect(page.locator('#update-status')).toContainText('No se pudo instalar la actualización.',{timeout:120000});
  await expect(page.locator('.cm-content')).toContainText('Documento conservado');
  await assertPluginAndPreference(page);
  await openUpdater(page);
  await expect(updater().getByText(`Versión instalada: ${baseVersion}`,{exact:true})).toBeVisible();

  phase='download and install signed candidate';
  mode='candidate';
  await updater().getByRole('button',{name:'Buscar actualizaciones',exact:true}).click();
  await expect(updater().getByText(`Nueva versión: ${targetVersion}`,{exact:true})).toBeVisible();
  await updater().getByText('Validación privada de actualización Windows.',{exact:true}).waitFor();
  try{await updater().getByRole('button',{name:'Descargar e instalar',exact:true}).click({noWaitAfter:true});}catch{}
  await waitForAppExit(appProcess);
  try{await browser.close();}catch{}
  browser=undefined;
  phase='reconnect to relaunched candidate application';
  ({browser,page}=await attachApp());
  for(const pid of runningAppPids(installedExecutable))spawnedAppPids.add(pid);
  phase='verify installed candidate and preserved data';
  await openUpdater(page);
  await updater().getByRole('button',{name:'Buscar actualizaciones',exact:true}).click();
  await expect(page.locator('#update-status')).toHaveText('No hay actualizaciones disponibles.',{timeout:120000});
  await expect(updater().getByText(`Versión instalada: ${targetVersion}`,{exact:true})).toBeVisible();

  await importDocument(page,documentPath,'Documento conservado');
  await assertPluginAndPreference(page);
  await expect(page.locator('#plugin-updater-persistence-test-alive')).toHaveText('Plugin persistente activo');
  process.stdout.write(`Validación nativa completada: ${baseVersion} -> ${targetVersion}; la firma inválida se rechazó, el instalador firmado se aplicó y el WebView2 reabrió con documento, preferencias y plugin locales disponibles.\n`);
  const windowClosed=page.waitForEvent('close',{timeout:15000});
  await page.keyboard.press('Alt+F4');
  await windowClosed;
}catch(error){
  primaryError=error;
  try{await captureFailure(error);}catch(captureError){diagnosticLog.write(`[capture:failure] ${captureError.stack??captureError.message}\n`);}
  throw error;
}finally{
  const cleanupErrors=[];
  try{await browser?.close();}catch(error){cleanupErrors.push(error);}
  if(appProcess&&appProcess.exitCode===null&&appProcess.signalCode===null){
    try{appProcess.kill();await Promise.race([once(appProcess,'exit'),delay(5000)]);}catch(error){cleanupErrors.push(error);}
  }
  if(installedExecutable){
    try{for(const pid of runningAppPids(installedExecutable))spawnedAppPids.add(pid);}catch(error){cleanupErrors.push(error);}
  }
  for(const pid of spawnedAppPids){
    let currentPids=[];
    try{currentPids=runningAppPids(installedExecutable);}catch(error){cleanupErrors.push(error);break;}
    if(!currentPids.includes(pid)){diagnosticLog.write(`[cleanup:skip-stale-pid] ${pid}\n`);continue;}
    try{
      const result=spawnSync('taskkill.exe',['/PID',String(pid),'/T','/F'],{encoding:'utf8',windowsHide:true,timeout:10000});
      if(result.error)cleanupErrors.push(result.error);
      else if(result.status!==0)diagnosticLog.write(`[cleanup:taskkill:${pid}] ${result.stderr??''}${result.stdout??''}`);
    }catch(error){cleanupErrors.push(error);}
  }
  try{await new Promise((resolveClose,rejectClose)=>server.close(error=>error?rejectClose(error):resolveClose()));}catch(error){cleanupErrors.push(error);}
  let deletionError;
  for(let attempt=0;attempt<8;attempt++){
    try{await rm(scratch,{recursive:true,force:true,maxRetries:0});deletionError=undefined;break;}
    catch(error){deletionError=error;if(!['EBUSY','EPERM','ENOTEMPTY'].includes(error.code))break;await delay(500);}
  }
  if(deletionError)cleanupErrors.push(deletionError);
  if(cleanupErrors.length)diagnosticLog.write(`[cleanup] ${cleanupErrors.map(error=>error.stack??error.message).join('\n')}\n`);
  await new Promise(resolveEnd=>diagnosticLog.end(resolveEnd));
  if(!primaryError&&cleanupErrors.length)throw cleanupErrors[0];
  if(!primaryError)await rm(diagnostics,{recursive:true,force:true});
}
