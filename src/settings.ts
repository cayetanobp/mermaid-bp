import {getPreferences,preferenceDefaults,subscribePreferences,updatePreferences,type Preferences} from './preferences';
import {closeAppMenus} from './app-menus';
import {setupDesktopUpdater} from './desktop-updater';
import './settings.css';
type Section='general'|'editor'|'diagram'|'extensions';
const sections:Record<Section,string>={general:'General',editor:'Editor',diagram:'Diagrama',extensions:'Extensiones'};
const fields:Record<Section,Array<keyof Preferences>>={general:['defaultPane','showHints','motion'],editor:['editorFontSize','lineWrapping','lineNumbers','highlightActiveLine'],diagram:['showGrid','zoomSpeed'],extensions:[]};

export function setupSettings(onEditorChange:()=>void){
 const dialog=document.createElement('dialog');dialog.id='settings-dialog';dialog.setAttribute('aria-labelledby','settings-title');
 dialog.innerHTML=`<header class="settings-heading"><h1 id="settings-title">Configuración</h1><button id="settings-close" type="button" aria-label="Cerrar configuración">×</button></header>
 <div class="settings-layout"><nav class="settings-sidebar" role="tablist" aria-label="Secciones de configuración" aria-orientation="vertical"></nav><div class="settings-content">
 <section id="settings-general" role="tabpanel" aria-labelledby="settings-tab-general"><h2>General</h2><p class="settings-intro">Preferencias para este navegador. Tus archivos y posiciones se conservan.</p></section>
 <section id="settings-editor" role="tabpanel" aria-labelledby="settings-tab-editor" hidden><h2>Editor</h2><p class="settings-intro">Ajusta la lectura y escritura del código Mermaid.</p></section>
 <section id="settings-diagram" role="tabpanel" aria-labelledby="settings-tab-diagram" hidden><h2>Diagrama</h2><p class="settings-intro">Cambia el lienzo y sus controles. Los estilos del archivo y de las exportaciones se conservan.</p></section>
 <section id="plugins-dialog" role="tabpanel" aria-labelledby="settings-tab-extensions" hidden><h2 id="plugins-title">Extensiones</h2><p class="settings-intro">Activa las funciones que necesitas. Para instalar un plugin, copia su carpeta en plugins y recarga la web.</p><div id="plugin-list"></div></section>
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
 subscribePreferences(apply);apply(getPreferences());setupDesktopUpdater(panel('general'));select('general');
 function open(section:Section){const current=document.activeElement as HTMLElement;const trigger=current.closest('[role="menu"]')?.getAttribute('aria-labelledby');returnFocus=trigger?document.getElementById(trigger):current;closeAppMenus();select(section);get('settings-status').textContent='Los cambios se guardan en este navegador.';if(!dialog.open)dialog.showModal();get('settings-tab-'+section).focus();}
 get('settings-button').onclick=()=>open('general');get('plugins-button').onclick=()=>open('extensions');
 get('settings-close').onclick=()=>dialog.close();get('plugins-close').onclick=()=>dialog.close();dialog.onclose=()=>returnFocus?.focus({preventScroll:true});
 get('settings-reset').onclick=()=>{const patch:Partial<Preferences>={};for(const key of fields[active])Object.assign(patch,{[key]:preferenceDefaults[key]});const saved=updatePreferences(patch);get('settings-status').textContent=saved?'Se han restablecido los ajustes de esta sección.':'Se han restablecido los ajustes durante esta sesión.';};
}
