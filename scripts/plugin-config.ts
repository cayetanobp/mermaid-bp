import {existsSync,readFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import type {PluginManifest} from '../src/plugin-api';
export interface InstalledPlugin { directory:string;manifest:PluginManifest & {entry?:string;build?:{entries?:Record<string,string>;outputs?:Record<string,string>;script?:string}} }
/** Descubrimiento de carpetas, sin registro manual. */
export function installedPlugins(root=process.cwd()):InstalledPlugin[] {
 const folder=resolve(root,'plugins'),override=process.env.MERMAID_BP_PLUGINS;
 if(!existsSync(folder)||override==='none')return[];
 const selected=override?.split(',');
 return readdirSync(folder,{withFileTypes:true}).filter(d=>d.isDirectory()&&/^[a-z][a-z0-9-]*$/.test(d.name)&&(!selected||selected.includes(d.name))).flatMap(d=>{
  try{
   const directory=resolve(folder,d.name),manifest=JSON.parse(readFileSync(resolve(directory,'plugin.json'),'utf8').replace(/^\uFEFF/,''));
   if(manifest.id!==d.name||typeof manifest.name!=='string'||typeof manifest.apiVersion!=='number')throw Error('Manifiesto no válido.');
   return[{directory,manifest}];
  }catch{console.warn(`No se pudo leer la extensión ${d.name}.`);return[];}
 });
}
