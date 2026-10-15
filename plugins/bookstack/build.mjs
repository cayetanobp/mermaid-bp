import { build } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';

const result = await build({
  configFile: false,
  logLevel: 'warn',
  build: {
    write: false,
    minify: 'esbuild',
    lib: { entry: 'plugins/bookstack/header.ts', formats: ['es'], fileName: () => 'header.js' },
    rollupOptions: {
      external: ['mermaid'],
      output: { inlineDynamicImports: true, paths: { mermaid: 'https://cdnjs.cloudflare.com/ajax/libs/mermaid/11.7.0/mermaid.esm.min.mjs' } },
    },
  },
});
const outputs = Array.isArray(result) ? result : [result];
const code = outputs.flatMap(r => r.output).filter(chunk => chunk.type === 'chunk').map(chunk => chunk.code).join('\n');
if (!code || code.includes('from "mermaid"') || code.includes("from 'mermaid'")) throw new Error('El encabezado no se ha generado correctamente.');
const header = '<!-- Mermaid BP: sustituye el script Mermaid anterior por todo este bloque. -->\n<script type="module">\n' +
  code.replace(/<\/script/gi, '<\\/script') + '\n</script>\n';
const out=process.env.MERMAID_BP_OUT_DIR || 'dist';
await mkdir(out,{recursive:true});
await writeFile(out+'/bookstack-header.html', header);
await mkdir('plugins/bookstack/public',{recursive:true});
await writeFile('plugins/bookstack/public/bookstack-header.html', header);
console.log('Encabezado BookStack listo para pegar (' + Buffer.byteLength(header) + ' bytes).');
