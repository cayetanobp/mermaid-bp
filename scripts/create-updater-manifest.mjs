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

function releaseArtifact(urlValue,signaturePath,extension,label){
  const artifactUrl=new URL(urlValue);
  if(artifactUrl.protocol!=='https:'||artifactUrl.hostname!=='github.com'||!artifactUrl.pathname.includes('/releases/download/'))throw new Error(`El artefacto ${label} debe usar una URL HTTPS de un release de GitHub.`);
  if(!artifactUrl.pathname.toLowerCase().endsWith(extension))throw new Error(`El updater ${label} debe apuntar a un artefacto ${label==='Windows'?'NSIS .exe':extension} firmado.`);
  return readFile(signaturePath,'utf8').then(value=>{
    const signature=value.trim();
    if(!signature)throw new Error(`El artefacto ${label} no tiene firma de updater.`);
    return{signature,url:artifactUrl.href};
  });
}

const input=options(process.argv.slice(2));
const version=input['--version'];
if(!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version))throw new Error('La versión del updater debe ser SemVer.');
const windows=await releaseArtifact(input['--artifact-url'],input['--signature-file'],'.exe','Windows');
const hasLinuxUrl=Boolean(input['--linux-artifact-url']),hasLinuxSignature=Boolean(input['--linux-signature-file']);
if(hasLinuxUrl!==hasLinuxSignature)throw new Error('El artefacto Linux y su firma deben especificarse juntos.');
const notes=(await readFile(input['--notes-file'],'utf8')).trim();
const platforms={'windows-x86_64':windows};
if(hasLinuxUrl)platforms['linux-x86_64-deb']=await releaseArtifact(input['--linux-artifact-url'],input['--linux-signature-file'],'.deb','Debian');
const manifest={
  version,
  notes,
  pub_date:new Date().toISOString(),
  platforms,
};
await writeFile(input['--output'],JSON.stringify(manifest,null,2)+'\n');
