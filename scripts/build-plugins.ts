import {installedPlugins} from './plugin-config.ts';
import {resolve,relative,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {cp,mkdir,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
const out=resolve(process.env.MERMAID_BP_OUT_DIR||'dist');
await mkdir(resolve(out,'plugins'),{recursive:true});
for(const plugin of installedPlugins()){
 const script=plugin.manifest.build?.script;
 if(plugin.manifest.apiVersion===1&&script){
  const file=resolve(plugin.directory,script),rel=relative(process.cwd(),file);
  if(rel.startsWith('..')||isAbsolute(rel)||!existsSync(file))throw Error('Ruta de compilación de extensión no válida.');
  await import(pathToFileURL(file).href);
 }
 const destination=resolve(out,'plugins',plugin.manifest.id);await mkdir(destination,{recursive:true});
 await cp(plugin.directory,destination,{recursive:true,filter:source=>!source.endsWith('.ts')&&!source.endsWith('build.mjs')&&!source.includes('node_modules')});
 const {build:_,...runtime}=plugin.manifest;
 await writeFile(resolve(destination,'plugin.json'),JSON.stringify(runtime,null,2)+'\n');
}
