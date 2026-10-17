import {getPreferences,preferenceDefaults,subscribePreferences,updatePreferences,type Preferences} from './preferences';
import {closeAppMenus} from './app-menus';
import {chooseLocalPluginFolder,desktopPluginBridge,installLocalPlugin} from './desktop-plugin-bridge';
import './settings.css';
type Section='general'|'editor'|'diagram'|'extensions';
const sections:Record<Section,string>={general:'General',editor:'Editor',diagram:'Diagrama',extensions:'Extensiones'};
const fields:Record<Section,Array<keyof Preferences>>={general:['defaultPane','showHints','motion'],editor:['editorFontSize','lineWrapping','lineNumbers','highlightActiveLine'],diagram:['showGrid','zoomSpeed'],extensions:[]};

export function setupSettings(onEditorChange:()=>void,reloadPlugins:()=>Promise<void>=async()=>{}){
 const dialog=document.createElement('dialog');dialog.id='settings-dialog';dialog.setAttribute('aria-labelledby','settings-title');
 dialog.innerHTML=`<header class="settings-heading"><h1 id="settings-title">Configuración</h1><button id="settings-close" type="button" aria-label="Cerrar configuración">×</button></header>
 <div class="settings-layout"><nav class="settings-sidebar" role="tablist" aria-label="Secciones de configuración" aria-orientation="vertical"></nav><div class="settings-content">
 <section id="settings-general" role="tabpanel" aria-labelledby="settings-tab-general"><h2>General</h2><p class="settings-intro">Preferencias para este navegador. Tus archivos y posiciones se conservan.</p></section>
 <section id="settings-editor" role="tabpanel" aria-labelledby="settings-tab-editor" hidden><h2>Editor</h2><p class="settings-intro">Ajusta la lectura y escritura del código Mermaid.</p></section>
 <section id="settings-diagram" role="tabpanel" aria-labelledby="settings-tab-diagram" hidden><h2>Diagrama</h2><p class="settings-intro">Cambia el lienzo y sus controles. Los estilos del archivo y de las exportaciones se conservan.</p></section>
 <section id="plugins-dialog" role="tabpanel" aria-labelledby="settings-tab-extensions" hidden><h2 id="plugins-title">Extensiones</h2><p class="settings-intro">Activa o desactiva plugins disponibles. La edición y el documento permanecen abiertos al gestionar extensiones.</p><div id="plugin-list"></div></section>
 </div></div><footer class="settings-footer"><p id="settings-status" role="status">Los cambios se guardan en este navegador.</p><button id="settings-reset" type="button">Restablecer sección</button><button id="plugins-close" type="button">Cerrar</button></footer>`;
 document.getElementById('app')!.append(dialog);
 // Espacio activa los controles del panel, sin iniciar el desplazamiento del lienzo.
 dialog.addEventListener('keydown',event=>{if(event.code==='Space')event.stopPropagation();});
 const sidebar=dialog.querySelector<HTMLElement>('.settings-sidebar')!,narrow=matchMedia('(max-width:650px)');
 const orientation=()=>sidebar.setAttribute('aria-orientation',narrow.matches?'horizontal':'vertical');orientation();narrow.addEventListener('change',orientation);
 const get=(id:string)=>document.getElementById(id)!;
 let active:Section='general',returnFocus:HTMLElement|null=null;
 const panel=(section:Section)=>get(section==='extensions'?'plugins-dialog':'settings-'+section);
 function select(section:Section,focus=false){
  active=section;
  for(const name of Object.keys(sections) as Section[]){const tab=get('settings-tab-'+name);tab.setAttribute('aria-selected',String(name===section));tab.tabIndex=name===section?0:-1;panel(name).hidden=name!==section;}
  get('settings-reset').hidden=section==='extensions';if(focus)get('settings-tab-'+section).focus();
 }
 for(const [name,label]of Object.entries(sections) as Array<[Section,string]>){
  const button=document.createElement('button');button.type='button';button.id='settings-tab-'+name;button.textContent=label;button.setAttribute('role','tab');button.setAttribute('aria-controls',panel(name).id);button.onclick=()=>select(name);button.onkeydown=event=>{if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const names=Object.keys(sections) as Section[],index=names.indexOf(name);select(event.key==='Home'?names[0]:event.key==='End'?names.at(-1)!:names[(index+(['ArrowDown','ArrowRight'].includes(event.key)?1:-1)+names.length)%names.length],true);};get('settings-dialog').querySelector('.settings-sidebar')!.append(button);
 }
 function row(section:Section,key:keyof Preferences,title:string,description:string,options?:Array<[string,string]>){
  const box=document.createElement('div');box.className='settings-row';const text=document.createElement('div'),label=document.createElement('label'),help=document.createElement('p');label.htmlFor='setting-'+key;label.textContent=title;help.id='setting-'+key+'-help';help.textContent=description;text.append(label,help);
  const input=options?document.createElement('select'):document.createElement('input');if(input instanceof HTMLInputElement)input.type='checkbox';else for(const[value,label]of options!){const option=document.createElement('option');option.value=value;option.textContent=label;input.append(option);}
  input.id='setting-'+key;input.dataset.preference=key;input.setAttribute('aria-describedby',help.id);input.onchange=()=>{
   const value=input instanceof HTMLInputElement?input.checked:['editorFontSize','zoomSpeed'].includes(key)?Number(input.value):input.value;
   const saved=updatePreferences({[key]:value});get('settings-status').textContent=saved?'Cambios guardados en este navegador.':'Cambios aplicados durante esta sesión. No se pudieron guardar.';
  };box.append(text,input);panel(section).append(box);
 }
 row('general','defaultPane','Vista al abrir','Elige qué vista se muestra la próxima vez que abras el editor.',[['remember','Recordar la última vista'],['code','Código'],['cascade','Cascada']]);
 row('general','showHints','Mostrar ayuda bajo el diagrama','Muestra un recordatorio de los controles del lienzo.');
 row('general','motion','Animaciones','Reduce el movimiento del resaltado al seleccionar un nodo.',[['system','Seguir la preferencia del sistema'],['reduce','Reducir movimiento']]);
 row('editor','editorFontSize','Tamaño del texto','Cambia solo el código; las etiquetas del diagrama conservan su tamaño.',Array.from({length:15},(_,i)=>[String(i+10),(i+10)+' px']));
 row('editor','lineWrapping','Ajustar líneas al ancho','Evita el desplazamiento horizontal al leer líneas largas.');
 row('editor','lineNumbers','Mostrar números de línea','Facilita localizar una línea del código.');
 row('editor','highlightActiveLine','Resaltar la línea actual','Señala la línea en la que estás escribiendo.');
 row('diagram','showGrid','Mostrar cuadrícula','Muestra los puntos del lienzo. No aparecen en las exportaciones.');
 row('diagram','zoomSpeed','Sensibilidad del zoom','Controla cuánto acerca o aleja cada movimiento de la rueda.',[['0.5','Muy suave'],['0.75','Suave'],['1','Normal'],['1.5','Rápida'],['2','Muy rápida']]);
 function apply(preferences:Readonly<Preferences>){
  const root=document.documentElement;root.style.setProperty('--editor-font-size',preferences.editorFontSize+'px');root.dataset.diagramGrid=String(preferences.showGrid);root.dataset.diagramHints=String(preferences.showHints);root.dataset.motion=preferences.motion;
  for(const input of dialog.querySelectorAll<HTMLInputElement|HTMLSelectElement>('[data-preference]')){const value=preferences[input.dataset.preference as keyof Preferences];if(input instanceof HTMLInputElement)input.checked=Boolean(value);else input.value=String(value);}
  onEditorChange();
 }
 if(desktopPluginBridge())get('plugins-dialog').insertAdjacentHTML('beforeend',`<div id="plugin-import-controls"><p>Instala una carpeta de plugin en el almacenamiento privado de esta aplicación.</p><label class="plugin-folder-label" for="plugin-folder-select">Elegir carpeta de plugin</label><button id="plugin-folder-select" type="button">Seleccionar carpeta</button><p id="plugin-import-error" role="alert" hidden></p><div id="plugin-import-preview" hidden></div><p id="plugin-trust-warning" hidden>El plugin ejecuta código local con los permisos de la aplicación. La API de plugins organiza sus funciones, pero no aísla ni limita ese código.</p><label id="plugin-trust-label" hidden><input id="plugin-trust-confirm" type="checkbox"> Entiendo que el plugin ejecutará código local con los permisos de la aplicación</label><button id="plugin-install" type="button" hidden disabled>Instalar plugin</button><p id="plugin-local-status" role="status" aria-live="polite"></p></div>`);
 const importControls=dialog.querySelector<HTMLElement>('#plugin-import-controls');
 if(importControls){
 const choose=dialog.querySelector<HTMLButtonElement>('#plugin-folder-select')!,preview=get('plugin-import-preview'),error=get('plugin-import-error'),warning=get('plugin-trust-warning'),trustLabel=get('plugin-trust-label') as HTMLElement,trust=get('plugin-trust-confirm') as HTMLInputElement,install=get('plugin-install') as HTMLButtonElement,status=get('plugin-local-status');
 let pending:{id:string;paths:string[];contents:Uint8Array[];name:string}|null=null;
 const showImportError=(message:string)=>{error.textContent=message;error.hidden=false;pending=null;preview.hidden=true;warning.hidden=true;trustLabel.hidden=true;install.hidden=true;};
 choose.onclick=async()=>{
  error.hidden=true;preview.hidden=true;warning.hidden=true;trustLabel.hidden=true;install.hidden=true;trust.checked=false;pending=null;status.textContent='';
  choose.disabled=true;
  try{
   const selection=await chooseLocalPluginFolder();if(!selection)return;
   const max=32*1024*1024;if(!selection.folderName||selection.paths.length===0||selection.paths.length!==selection.contents.length||selection.paths.length>256||selection.contents.reduce((sum,bytes)=>sum+bytes.length,0)>max)throw Error('La carpeta supera los límites de archivos o tamaño (256 archivos y 32 MB), o no contiene archivos.');
   const paths:string[]=[],contents:Uint8Array[]=[];let manifest:Record<string,unknown>|null=null;
   for(let i=0;i<selection.paths.length;i++){const path=selection.paths[i],raw=selection.contents[i];if(typeof path!=='string'||!path||path.startsWith('/')||path.split('/').some(part=>!part||part==='.'||part==='..')||path.includes('\\'))throw Error('La carpeta contiene una ruta de archivo no válida.');const bytes=Uint8Array.from(raw);paths.push(path);contents.push(bytes);if(path==='plugin.json'){try{manifest=JSON.parse(new TextDecoder().decode(bytes));}catch{throw Error('plugin.json no contiene JSON válido.');}}}
   if(!manifest||typeof manifest!=='object'||Array.isArray(manifest))throw Error('La carpeta debe incluir plugin.json en su raíz.');
   const id=manifest.id,name=manifest.name,description=manifest.description,version=manifest.version,apiVersion=manifest.apiVersion,entry=manifest.entry??'index.js';
   if(typeof id!=='string'||!/^[a-z][a-z0-9-]*$/.test(id)||typeof name!=='string'||!name.trim()||typeof description!=='string'||!description.trim()||typeof version!=='string'||!version.trim()||!Number.isInteger(apiVersion))throw Error('plugin.json debe incluir id, name, description, version y apiVersion válidos.');
   if(selection.folderName!==id)throw Error('El nombre de la carpeta debe coincidir con el id de plugin.json.');
   if(manifest.enabledByDefault!==undefined&&typeof manifest.enabledByDefault!=='boolean')throw Error('El campo enabledByDefault debe ser booleano.');
   if(apiVersion!==1)throw Error(`La API ${apiVersion} no es compatible; esta aplicación admite la API 1.`);
   if(typeof entry!=='string'||!/^[a-zA-Z0-9_./-]+\.(?:m?js)$/.test(entry)||entry.startsWith('/')||entry.split('/').some(part=>part==='..'||part===''))throw Error('La ruta de entrada no es válida.');
   if(!paths.includes(entry))throw Error(`No se encontró el archivo de entrada ${entry}.`);
   pending={id,paths,contents,name};preview.textContent=`${name} · versión ${version} · API 1 compatible`;preview.hidden=false;warning.hidden=false;trustLabel.hidden=false;install.textContent='Instalar o actualizar plugin';install.hidden=false;install.disabled=true;
  }catch(reason){showImportError(reason instanceof Error?reason.message:'No se pudo validar la carpeta del plugin.');}
  finally{choose.disabled=false;}
 };
 trust.onchange=()=>{install.disabled=!trust.checked;};
 install.onclick=async()=>{
  if(!pending||!trust.checked)return;install.disabled=true;status.textContent='Instalando plugin…';
  try{const current=pending;const message=await installLocalPlugin(current.id,current.paths,current.contents);await reloadPlugins();status.textContent=message;pending=null;preview.hidden=true;warning.hidden=true;trustLabel.hidden=true;install.hidden=true;trust.checked=false;}
  catch(reason){status.textContent='No se pudo instalar: '+(reason instanceof Error?reason.message:String(reason));install.disabled=false;}
 };
 }
 subscribePreferences(apply);apply(getPreferences());select('general');
 function open(section:Section){const current=document.activeElement as HTMLElement;const trigger=current.closest('[role="menu"]')?.getAttribute('aria-labelledby');returnFocus=trigger?document.getElementById(trigger):current;closeAppMenus();select(section);get('settings-status').textContent='Los cambios se guardan en este navegador.';if(!dialog.open)dialog.showModal();get('settings-tab-'+section).focus();}
 get('settings-button').onclick=()=>open('general');get('plugins-button').onclick=()=>open('extensions');
 get('settings-close').onclick=()=>dialog.close();get('plugins-close').onclick=()=>dialog.close();dialog.onclose=()=>returnFocus?.focus({preventScroll:true});
 get('settings-reset').onclick=()=>{const patch:Partial<Preferences>={};for(const key of fields[active])Object.assign(patch,{[key]:preferenceDefaults[key]});const saved=updatePreferences(patch);get('settings-status').textContent=saved?'Se han restablecido los ajustes de esta sección.':'Se han restablecido los ajustes durante esta sesión.';};
}
