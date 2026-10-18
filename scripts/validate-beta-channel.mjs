import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

export function inspectBetaChannel(releases,tags){
  if(!Array.isArray(releases)||!Array.isArray(tags))throw new Error('La consulta del canal beta debe devolver listas de releases y tags.');
  const tagExists=tags.flat().some(tag=>tag.ref==='refs/tags/beta');
  const matches=releases.flat().filter(release=>release.tag_name==='beta');
  if(matches.length>1)throw new Error('Hay más de una release para el tag beta.');
  if(matches.length===0){
    if(tagExists)throw new Error('El tag beta ya existe sin una release propietaria; no se sobrescribirá.');
    return 'empty';
  }
  const release=matches[0];
  if(!tagExists)throw new Error('La release beta no tiene el tag esperado.');
  if(release.name!=='Canal beta de Mermaid BP'||release.draft||!release.prerelease)throw new Error('La release beta existente no pertenece al canal beta de Mermaid BP.');
  const assetNames=(release.assets??[]).map(asset=>typeof asset==='string'?asset:asset.name);
  if(assetNames.some(name=>name!=='latest.json')||assetNames.filter(name=>name==='latest.json').length>1)throw new Error('La release beta contiene assets ajenos al manifiesto del canal.');
  return assetNames.includes('latest.json')?'owned-with-manifest':'owned-empty';
}

function parseOptions(args){
  const result={};
  for(let index=0;index<args.length;index+=2){
    const name=args[index],value=args[index+1];
    if(!['--releases-file','--tags-file'].includes(name)||!value||result[name])throw new Error('Usa --releases-file y --tags-file.');
    result[name]=value;
  }
  for(const name of ['--releases-file','--tags-file'])if(!result[name])throw new Error(`Falta ${name}.`);
  return result;
}

async function main(){
  const input=parseOptions(process.argv.slice(2));
  const [releases,tags]=await Promise.all([
    readFile(input['--releases-file'],'utf8').then(text=>JSON.parse(text.replace(/^\uFEFF/,''))),
    readFile(input['--tags-file'],'utf8').then(text=>JSON.parse(text.replace(/^\uFEFF/,''))),
  ]);
  process.stdout.write(`${inspectBetaChannel(releases,tags)}\n`);
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  main().catch(error=>{
    console.error(error.message);
    process.exitCode=1;
  });
}
