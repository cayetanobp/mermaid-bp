import type {PluginDescriptor,PluginManifest} from './plugin-api';
export const descriptors:PluginDescriptor[]=[];
export const discoveryErrors:string[]=[];
let discovery:Promise<void>|undefined;
const key='mermaid-bp:plugins:v1';
/** El servidor enumera las carpetas, como el autoindex JSON de nginx. */
export function discoverPlugins(base=new URL('./plugins/',document.baseURI)):Promise<void>{
 return discovery??=(async()=>{
  try{
   const response=await fetch(base,{cache:'no-store'});if(response.status===404)return;if(!response.ok)throw Error();
   const entries:unknown=await response.json();if(!Array.isArray(entries))throw Error();
   const names=[...new Set(entries.filter(e=>e?.type==='directory'&&typeof e.name==='string').map(e=>e.name.replace(/\/$/,'')))].filter(name=>/^[a-z][a-z0-9-]*$/.test(name)).sort();
   const found=await Promise.all(names.map(async id=>{
    try{
     const folder=new URL(id+'/',base),response=await fetch(new URL('plugin.json',folder),{cache:'no-store'});if(!response.ok)throw Error();
     const manifest:PluginManifest&{entry?:string}=await response.json();
     if(manifest.id!==id||typeof manifest.name!=='string'||!manifest.name||typeof manifest.description!=='string'||typeof manifest.version!=='string'||!Number.isInteger(manifest.apiVersion))throw Error();
     const entry=manifest.entry??'index.js';if(!/^[a-zA-Z0-9_./-]+\.(?:m?js)$/.test(entry)||entry.split('/').includes('..')||entry.startsWith('/'))throw Error();
     const url=new URL(entry,folder).href;
     return{manifest,load:()=>import(/* @vite-ignore */ url)} satisfies PluginDescriptor;
    }catch{discoveryErrors.push(`No se ha podido cargar la extensión ${id}.`);return null;}
   }));
   descriptors.push(...found.filter((p):p is NonNullable<typeof p>=>p!==null));
  }catch{discoveryErrors.push('No se ha podido consultar la carpeta de extensiones.');}
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
