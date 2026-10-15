import {existsSync,readFileSync} from 'node:fs';
import {resolve,relative,isAbsolute} from 'node:path';
import type {PluginManifest} from '../src/plugin-api';
export interface InstalledPlugin { directory:string;manifest:PluginManifest & {build?:{entries?:Record<string,string>;outputs?:Record<string,string>;script?:string}} }
export function installedPlugins(root=process.cwd()):InstalledPlugin[] {
  const configured=JSON.parse(readFileSync(resolve(root,'plugins.config.json'),'utf8').replace(/^\uFEFF/,''));
  const override=process.env.MERMAID_BP_PLUGINS;
  const ids:string[]=override===undefined?configured.plugins:override==='none'?[]:override.split(',').filter(Boolean);
  if(!Array.isArray(ids)||new Set(ids).size!==ids.length)throw Error('La lista de extensiones no es válida.');
  return ids.map(id=>{
    if(typeof id!=='string'||!/^[a-z][a-z0-9-]*$/.test(id))throw Error('Identificador de extensión no válido.');
    const directory=resolve(root,'plugins',id),file=resolve(directory,'plugin.json');
    if(!existsSync(file))throw Error(`No se encuentra la extensión ${id}.`);
    const manifest=JSON.parse(readFileSync(file,'utf8').replace(/^\uFEFF/,''));
    if(manifest.id!==id||typeof manifest.name!=='string'||typeof manifest.apiVersion!=='number')throw Error(`Manifiesto no válido en ${id}.`);
    for(const entry of [...Object.values(manifest.build?.entries??{}),manifest.build?.script].filter(Boolean)){
      if(typeof entry!=='string')throw Error('Ruta de extensión no válida.');
      const path=resolve(directory,entry),rel=relative(root,path);
      if(rel.startsWith('..')||isAbsolute(rel)||!existsSync(path))throw Error(`La ruta de ${id} no existe o sale del proyecto.`);
    }
    return {directory,manifest};
  });
}
