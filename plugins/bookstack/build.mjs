import { build, transformWithEsbuild } from 'vite';
import { mkdir, writeFile,readFile } from 'node:fs/promises';

const out=process.env.MERMAID_BP_OUT_DIR || 'dist';
const packageDir=out+'/plugins/bookstack';
await build({configFile:false,base:'./',logLevel:'warn',build:{outDir:packageDir,emptyOutDir:false,chunkSizeWarningLimit:1600,rollupOptions:{preserveEntrySignatures:'strict',input:{bookstack:'bookstack.html','bookstack-viewer':'plugins/bookstack/viewer.ts'},output:{entryFileNames:chunk=>chunk.name==='bookstack-viewer'?'bookstack-viewer.js':'assets/[name]-[hash].js'}}}});
const result = await build({
  configFile: false,
  logLevel: 'warn',
  build: {
    write: false,
    minify: 'esbuild',
    lib: { entry: 'plugins/bookstack/header.ts', formats: ['es'], fileName: () => 'header.js' },
    rollupOptions: {
      external: ['mermaid'],
      output: { inlineDynamicImports: true, paths: { mermaid: 'https://cdn.jsdelivr.net/npm/mermaid@11.17.2/dist/mermaid.esm.min.mjs' } },
    },
  },
});
const outputs = Array.isArray(result) ? result : [result];
const code = outputs.flatMap(r => r.output).filter(chunk => chunk.type === 'chunk').map(chunk => chunk.code).join('\n');
if (!code || code.includes('from "mermaid"') || code.includes("from 'mermaid'")) throw new Error('El encabezado no se ha generado correctamente.');
// Compactar también espacios: Vite los conserva en bibliotecas ES y el campo de BookStack puede truncarse.
const compact = await transformWithEsbuild(code,'bookstack-header.js',{loader:'js',minify:true,target:'es2022',legalComments:'none'});
const header = '<!-- Mermaid BP: sustituye el script Mermaid anterior por todo este bloque. -->\n<script type="module">\n' +
  compact.code.replace(/<\/script/gi, '<\\/script') + '\n</script>\n';
if(Buffer.byteLength(header)>60_000)throw new Error('El encabezado supera el tamaño previsto para pegarlo en BookStack.');
await mkdir(out,{recursive:true});
await writeFile(out+'/bookstack-header.html', header);
await writeFile(packageDir+'/bookstack-header.html',header);
// Entradas antiguas para enlaces ya guardados; el paquete funciona por sí solo.
const html=await readFile(packageDir+'/bookstack.html','utf8');
await writeFile(out+'/bookstack.html',html.replaceAll('./assets/','./plugins/bookstack/assets/'));
await writeFile(out+'/bookstack-viewer.js',"export * from './plugins/bookstack/bookstack-viewer.js';\n");
await mkdir('plugins/bookstack/public',{recursive:true});
await writeFile('plugins/bookstack/public/bookstack-header.html', header);
console.log('Encabezado BookStack listo para pegar (' + Buffer.byteLength(header) + ' bytes).');
