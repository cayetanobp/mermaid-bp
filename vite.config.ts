import {defineConfig,type Plugin} from 'vite';
import {resolve} from 'node:path';
import {readFileSync,existsSync} from 'node:fs';
import {installedPlugins} from './scripts/plugin-config';
const installed=installedPlugins();
const entries:Record<string,string>={main:'index.html'},outputs:Record<string,string>={};
for(const p of installed)if(p.manifest.apiVersion===1){for(const [name,path] of Object.entries(p.manifest.build?.entries??{}))entries[name]=resolve(p.directory,path);Object.assign(outputs,p.manifest.build?.outputs);}
const registry:Plugin={name:'editor-plugins',resolveId:id=>id==='virtual:editor-plugins'?'\0editor-plugins':null,
 load:id=>id==='\0editor-plugins'?`export default [${installed.map(p=>`{manifest:${JSON.stringify(p.manifest)},load:()=>import(${JSON.stringify('/plugins/'+p.manifest.id+'/index.ts')})}`).join(',')}];`:null,
 configureServer(server){server.middlewares.use((req,res,next)=>{for(const p of installed){const path=resolve(p.directory,'public','.'+(req.url??'').split('?')[0]);if(path.startsWith(resolve(p.directory,'public')+'/')||path.startsWith(resolve(p.directory,'public')+'\\'))if(existsSync(path)&&req.url?.endsWith('.html')){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(readFileSync(path));return;}}next();});}};
export default defineConfig({base:'./',plugins:[registry],build:{outDir:process.env.MERMAID_BP_OUT_DIR||'dist',chunkSizeWarningLimit:1600,rollupOptions:{preserveEntrySignatures:'strict',input:entries,output:{entryFileNames:chunk=>outputs[chunk.name]??'assets/[name]-[hash].js'}}}});
