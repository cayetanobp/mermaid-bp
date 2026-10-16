import {readFile,readdir,writeFile} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {createHash} from 'node:crypto';

const [metadataPath,outputPath]=process.argv.slice(2);
if(!metadataPath||!outputPath)throw Error('Uso: node write-rust-third-party-notices.mjs <cargo-metadata.json> <salida.md>');
const metadata=JSON.parse(await readFile(metadataPath,'utf8'));
const included=new Set(metadata.resolve.nodes.map(node=>node.id));
const fallback={
  'alloc-stdlib':['rust-alloc-no-stdlib-BSD-3-Clause.txt','https://github.com/dropbox/rust-alloc-no-stdlib/blob/master/LICENSE'],
  'selectors':['MPL-2.0.txt','https://www.mozilla.org/media/MPL/2.0/index.txt'],
  'webview2-com':['webview2-rs-MIT.txt','https://github.com/wravery/webview2-rs/blob/main/LICENSE'],
  'webview2-com-macros':['webview2-rs-MIT.txt','https://github.com/wravery/webview2-rs/blob/main/LICENSE'],
  'webview2-com-sys':['webview2-rs-MIT.txt','https://github.com/wravery/webview2-rs/blob/main/LICENSE']
};
const packages=metadata.packages.filter(pkg=>included.has(pkg.id)&&pkg.source)
  .sort((a,b)=>a.name.localeCompare(b.name)||a.version.localeCompare(b.version));
const lines=['# Avisos de dependencias Rust para Windows','',
  'Inventario de crates resuelto por Cargo para `x86_64-pc-windows-msvc`. Cada crate conserva su licencia; AGPL-3.0-only se aplica al código original de Mermaid BP.',''];
const missing=[];
const uniqueTexts=new Map();
const addText=(body,source)=>{
  const normalized=body.split(/\r?\n/).map(line=>line.trimEnd()).join('\n').trim();
  const hash=createHash('sha256').update(normalized).digest('hex');
  if(!uniqueTexts.has(hash))uniqueTexts.set(hash,{number:uniqueTexts.size+1,body:normalized,source});
  return uniqueTexts.get(hash).number;
};
for(const pkg of packages){
  if(!pkg.license)throw Error(`Crate sin licencia declarada: ${pkg.name}@${pkg.version}`);
  const directory=dirname(pkg.manifest_path);
  const files=(await readdir(directory,{withFileTypes:true}))
    .filter(item=>item.isFile()&&/^(?:licen[cs]e|copying|notice)(?:[-.]|$)/i.test(item.name))
    .map(item=>item.name).sort();
  lines.push(`## ${pkg.name} ${pkg.version} — ${pkg.license}`,'',
    `Origen: ${pkg.repository??pkg.source}.`,
    `Autores declarados: ${pkg.authors.length?pkg.authors.join('; '):'no indicados en los metadatos del crate'}.`,'');
  if(!files.length){
    missing.push(`${pkg.name}@${pkg.version}`);
    const source=fallback[pkg.name];
    if(!source)throw Error(`Falta texto de licencia para ${pkg.name}@${pkg.version}`);
    const body=await readFile(new URL(`../licenses/upstream/${source[0]}`,import.meta.url),'utf8');
    const number=addText(body,source[1]);
    lines.push(`El crate publicado omite el archivo de licencia; se incluye el [texto ${number}](#texto-${number}) de ${source[1]}.`,'');
  }
  for(const file of files){
    const number=addText(await readFile(join(directory,file),'utf8'),`${pkg.name}@${pkg.version}/${file}`);
    lines.push(`${file}: [texto ${number}](#texto-${number}).`,'');
  }
}
lines.push('## Textos de licencia y avisos','');
for(const {number,body,source} of uniqueTexts.values())lines.push(`### Texto ${number}`,'',`Procedencia: ${source}.`,'',body,'');
while(lines.at(-1)==='')lines.pop();
await writeFile(outputPath,lines.join('\n')+'\n');
console.log(`${packages.length} crates; ${uniqueTexts.size} textos distintos; ${missing.length} sin archivo de licencia separado: ${missing.join(', ')}`);
