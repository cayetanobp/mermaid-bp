import type {PluginDescriptor,PluginManifest} from './plugin-api';
export const descriptors:PluginDescriptor[]=[];
export const discoveryErrors:string[]=[];
let discovery:Promise<void>|undefined;
const key='mermaid-bp:plugins:v1';
/** El servidor enumera las carpetas, como el autoindex JSON de nginx. */
export function discoverPlugins(base=new URL('./plugins/',document.baseURI)):Promise<void>{
 return discovery??=(async()=>{
  try{
   const desktop=document.querySelector('meta[name="mermaid-bp-desktop"]')||Object.hasOwn(window,'__TAURI__');
   const index=desktop?new URL('index.json',base):base;
   const response=await fetch(index,{cache:'no-store'});if(response.status===404)return;if(!response.ok)throw Error('No se pudo consultar la carpeta de extensiones.');
   const entries:unknown=await response.json();if(!Array.isArray(entries))throw Error('El listado de extensiones no es válido.');
   const names=[...new Set(entries.filter(e=>e?.type==='directory'&&typeof e.name==='string').map(e=>e.name.replace(/\/$/,'')))].filter(name=>/^[a-z][a-z0-9-]*$/.test(name)).sort();
   const found=await Promise.all(names.map(async id=>{
    try{
     const folder=new URL(id+'/',base),response=await fetch(new URL('plugin.json',folder),{cache:'no-store'});if(!response.ok)throw Error('No se pudo leer plugin.json.');
     let parsed:unknown;
     try{parsed=await response.json();}catch{throw Error('El manifiesto no contiene JSON válido.');}
     if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw Error('El manifiesto no cumple el contrato público.');
     const manifest=parsed as PluginManifest;
     if(manifest.id!==id||typeof manifest.name!=='string'||!manifest.name.trim()||typeof manifest.description!=='string'||!manifest.description.trim()||typeof manifest.version!=='string'||!manifest.version.trim()||!Number.isInteger(manifest.apiVersion))throw Error('El manifiesto no cumple el contrato público.');
     if(manifest.enabledByDefault!==undefined&&typeof manifest.enabledByDefault!=='boolean')throw Error('El campo enabledByDefault debe ser booleano.');
     const entry=manifest.entry===undefined?'index.js':manifest.entry;
     if(typeof entry!=='string'||!/^[a-zA-Z0-9_./-]+\.(?:m?js)$/.test(entry)||entry.split('/').includes('..')||entry.startsWith('/'))throw Error('La ruta de entrada no es válida.');
     const entryUrl=new URL(entry,folder);if(entryUrl.origin!==folder.origin||!entryUrl.pathname.startsWith(folder.pathname))throw Error('La ruta de entrada debe permanecer dentro de la carpeta del plugin.');
     const entryResponse=await fetch(entryUrl,{method:'HEAD',cache:'no-store'});if(!entryResponse.ok)throw Error('No se pudo leer el archivo de entrada.');
     const url=entryUrl.href;
     return{manifest,load:()=>import(/* @vite-ignore */ url)} satisfies PluginDescriptor;
    }catch(error){const reason=error instanceof Error&&error.message?error.message:'Error de manifiesto o entrada.';discoveryErrors.push('No se ha podido cargar la extensión '+id+': '+reason);return null;}
   }));
   descriptors.push(...found.filter((p):p is NonNullable<typeof p>=>p!==null));
  }catch(error){discoveryErrors.push(error instanceof Error&&error.message?error.message:'No se ha podido consultar la carpeta de extensiones.');}
 })();
}
export function enabledPreference(id:string,fallback:boolean):boolean{
 try{const value=JSON.parse(localStorage.getItem(key)||'{}')[id];return typeof value==='boolean'?value:fallback;}catch{return fallback;}
}
export function savePluginPreference(id:string,enabled:boolean){
 try{const previous=JSON.parse(localStorage.getItem(key)||'{}');localStorage.setItem(key,JSON.stringify({...previous,[id]:enabled}));}catch{/* Preferencia solo en memoria. */}
}
export function isPluginEnabled(id:string):boolean{
 const plugin=descriptors.find(p=>p.manifest.id===id);return !!plugin&&plugin.manifest.apiVersion===1&&enabledPreference(id,plugin.manifest.enabledByDefault!==false);
}
