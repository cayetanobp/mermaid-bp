import {existsSync,readFileSync,readdirSync,realpathSync,statSync} from 'node:fs';
import {resolve,relative,extname,isAbsolute,basename} from 'node:path';
import type {Plugin,ViteDevServer} from 'vite';
import {installedPlugins} from './plugin-config';
const mime:Record<string,string>={'.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.html':'text/html','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2'};
function inside(folder:string,file:string){const rel=relative(realpathSync(folder),realpathSync(file));return !rel.startsWith('..')&&!isAbsolute(rel);}
/** Archivos externos al bundle, visibles tras copiar o retirar una carpeta. */
export function runtimePlugins():Plugin{
 const root=process.cwd(),pluginsRoot=resolve(root,'plugins');
 const middleware=(dev?:ViteDevServer)=>async(req:any,res:any,next:()=>void)=>{
  let path:string;try{path=decodeURIComponent(new URL(req.url??'','http://localhost').pathname);}catch{res.statusCode=400;res.end();return;}
  if(dev&&path==='/bookstack.html'){res.statusCode=302;res.setHeader('Location','/plugins/bookstack/bookstack.html');res.end();return;}
  if(!path.startsWith('/plugins/')){next();return;}
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  if(path==='/plugins/'){
   const selected=process.env.MERMAID_BP_PLUGINS;
   const entries=selected==='none'||!existsSync(pluginsRoot)?[]:readdirSync(pluginsRoot,{withFileTypes:true}).filter(d=>d.isDirectory()&&/^[a-z][a-z0-9-]*$/.test(d.name)&&(!selected||selected.split(',').includes(d.name))).map(d=>({name:d.name,type:'directory'}));
   res.setHeader('Content-Type','application/json');res.end(JSON.stringify(entries));return;
  }
  const parts=path.slice('/plugins/'.length).split('/'),id=parts.shift()!;
  const plugin=installedPlugins(root).find(p=>p.manifest.id===id);
  if(!plugin){res.statusCode=404;res.end();return;}
  const compiled=resolve(root,process.env.MERMAID_BP_OUT_DIR||'dist','plugins',id);
  const sourceFolders=[plugin.directory,resolve(plugin.directory,'public')];
  // Las entradas fuente declaradas por el autor necesitan su salida compilada en preview.
  const builtEntry=!dev&&plugin.manifest.build?.script&&Object.values(plugin.manifest.build.entries??{}).some(entry=>basename(entry)===parts.join('/'));
  const folders=builtEntry?[compiled,...sourceFolders]:[...sourceFolders,compiled];
  let file=folders.map(folder=>({folder,file:resolve(folder,...parts)})).find(p=>existsSync(p.file)&&statSync(p.file).isFile()&&inside(p.folder,p.file))?.file;
  // Las entradas fuente de plugins incluidos se transforman solo durante desarrollo.
  if(dev&&!file){const entry=Object.values(plugin.manifest.build?.entries??{}).find(entry=>basename(entry)===parts.join('/'));if(entry){const candidate=resolve(plugin.directory,entry);if(existsSync(candidate)&&inside(root,candidate))file=candidate;}}
  if(!file){res.statusCode=404;res.end();return;}
  if(dev&&extname(file)==='.ts'){next();return;}
  try{const body=readFileSync(file);res.setHeader('Content-Type',mime[extname(file)]??'application/octet-stream');res.end(dev&&extname(file)==='.html'?await dev.transformIndexHtml(path,body.toString()):body);}catch{res.statusCode=500;res.end();}
 };
 return{name:'runtime-plugins',configureServer(server){server.middlewares.use(middleware(server));},configurePreviewServer(server){server.middlewares.use(middleware());}};
}
