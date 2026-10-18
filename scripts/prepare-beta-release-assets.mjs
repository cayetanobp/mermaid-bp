import {createHash} from 'node:crypto';
import {copyFile,mkdir,readFile,writeFile} from 'node:fs/promises';
import {basename,join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {normalizeReleaseAssetName} from './normalize-release-asset-name.mjs';

function sha256(bytes){
  return createHash('sha256').update(bytes).digest('hex');
}

export async function prepareBetaReleaseAssets({windowsFile,windowsSignature,linuxFile,linuxSignature,outputDirectory}){
  const output=resolve(outputDirectory);
  await mkdir(output);
  const prepared={};
  for(const [platform,sourceFile,sourceSignature] of [
    ['windows',windowsFile,windowsSignature],
    ['linux',linuxFile,linuxSignature],
  ]){
    const name=normalizeReleaseAssetName(basename(sourceFile));
    const assetPath=join(output,name);
    const signaturePath=`${assetPath}.sig`;
    const checksumPath=`${assetPath}.sha256`;
    const [sourceBytes,sourceSignatureBytes]=await Promise.all([readFile(sourceFile),readFile(sourceSignature)]);
    if(sourceBytes.length===0||sourceSignatureBytes.length===0)throw new Error(`El asset ${platform} o su firma están vacíos.`);
    await Promise.all([
      copyFile(sourceFile,assetPath),
      copyFile(sourceSignature,signaturePath),
    ]);
    const [stagedBytes,stagedSignatureBytes]=await Promise.all([readFile(assetPath),readFile(signaturePath)]);
    if(!stagedBytes.equals(sourceBytes)||!stagedSignatureBytes.equals(sourceSignatureBytes))throw new Error(`La preparación alteró el asset ${platform} o su firma.`);
    const digest=sha256(stagedBytes);
    await writeFile(checksumPath,`${digest}  ${name}`,{encoding:'ascii',flag:'wx'});
    prepared[platform]={name,path:assetPath,signaturePath,checksumPath,sha256:digest};
  }
  return prepared;
}

function parseArgs(args){
  const values={};
  for(let index=0;index<args.length;index+=2){
    const key=args[index];
    if(!key?.startsWith('--')||!args[index+1]||values[key])throw new Error('Argumentos inválidos para preparar la release beta.');
    values[key]=args[index+1];
  }
  const required=['--windows-file','--windows-signature','--linux-file','--linux-signature','--output-directory','--metadata-file'];
  for(const key of required)if(!values[key])throw new Error(`Falta ${key}.`);
  return values;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const args=parseArgs(process.argv.slice(2));
  const prepared=await prepareBetaReleaseAssets({
    windowsFile:args['--windows-file'],
    windowsSignature:args['--windows-signature'],
    linuxFile:args['--linux-file'],
    linuxSignature:args['--linux-signature'],
    outputDirectory:args['--output-directory'],
  });
  await writeFile(args['--metadata-file'],JSON.stringify(prepared,null,2)+'\n',{encoding:'utf8',flag:'wx'});
}
