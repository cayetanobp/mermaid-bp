import {readFile,writeFile} from 'node:fs/promises';

function options(args){
  const values={};
  for(let index=0;index<args.length;index+=2){
    const name=args[index];
    if(!name?.startsWith('--')||!args[index+1]||values[name])throw new Error('Usa --version, --notes-file, --artifact-url, --signature-file y --output.');
    values[name]=args[index+1];
  }
  for(const name of ['--version','--notes-file','--artifact-url','--signature-file','--output'])if(!values[name])throw new Error(`Falta ${name}.`);
  return values;
}

const input=options(process.argv.slice(2));
const version=input['--version'];
if(!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version))throw new Error('La versión del updater debe ser SemVer.');
const artifactUrl=new URL(input['--artifact-url']);
if(artifactUrl.protocol!=='https:'||artifactUrl.hostname!=='github.com'||!artifactUrl.pathname.includes('/releases/download/'))throw new Error('El artefacto del updater debe usar una URL HTTPS de un release de GitHub.');
if(!artifactUrl.pathname.toLowerCase().endsWith('.exe'))throw new Error('El updater Windows debe apuntar al instalador NSIS .exe firmado que genera Tauri 2.');
const signature=(await readFile(input['--signature-file'],'utf8')).trim();
if(!signature)throw new Error('El artefacto no tiene firma de updater.');
const notes=(await readFile(input['--notes-file'],'utf8')).trim();
const manifest={
  version,
  notes,
  pub_date:new Date().toISOString(),
  platforms:{
    'windows-x86_64':{signature,url:artifactUrl.href},
  },
};
await writeFile(input['--output'],JSON.stringify(manifest,null,2)+'\n');
