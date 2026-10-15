import {spawnSync} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const out=resolve(root,'desktop-app/dist');
// Ejecutar npm mediante Node evita depender del shell de Windows.
const npm=process.env.npm_execpath;
if(!npm)throw Error('Ejecuta la compilación mediante npm run desktop:build.');
const build=spawnSync(process.execPath,[npm,'run','build'],{cwd:root,stdio:'inherit',env:{...process.env,MERMAID_BP_OUT_DIR:out}});
if(build.status!==0)process.exit(build.status??1);
const {installedPlugins}=await import('../scripts/plugin-config.ts');
const entries=installedPlugins(root).map(plugin=>({name:plugin.manifest.id,type:'directory'}));
await mkdir(resolve(out,'plugins'),{recursive:true});
await writeFile(resolve(out,'plugins/index.json'),JSON.stringify(entries));
// Tauri sirve archivos estáticos y no proporciona el autoindex de Nginx.
const html=await readFile(resolve(out,'index.html'),'utf8');
await writeFile(resolve(out,'index.html'),html.replace('<head>','<head><meta name="mermaid-bp-desktop" content="true">'));
