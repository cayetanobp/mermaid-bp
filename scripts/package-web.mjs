import {mkdir,readdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {zipSync} from 'fflate';

/** Empaquetar solo la web compilada y sus instrucciones, sin herramientas de desarrollo. */
export async function packageWeb(root=process.cwd(),out=resolve(root,'artifacts/releases')) {
  const entries={};
  const collect=async(folder,prefix)=>{
    for(const item of (await readdir(folder,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))) {
      const file=join(folder,item.name),name=prefix+'/'+item.name;
      if(item.isSymbolicLink())throw Error('El paquete no admite enlaces simbólicos: '+name);
      if(item.isDirectory())await collect(file,name);
      else if(item.isFile())entries[name]=new Uint8Array(await readFile(file));
    }
  };
  await readFile(resolve(root,'dist/index.html'));
  await collect(resolve(root,'dist'),'site');
  entries['site/LICENSE']=new Uint8Array(await readFile(resolve(root,'LICENSE')));
  entries['site/NOTICE.md']=new Uint8Array(await readFile(resolve(root,'NOTICE.md')));
  for(const file of ['mermaid-bp.conf','mermaid-bp-static.conf'])entries['nginx/'+file]=new Uint8Array(await readFile(resolve(root,'deploy/nginx',file)));
  entries['LEEME.md']=new Uint8Array(await readFile(resolve(root,'docs/nginx.md')));
  const archive=zipSync(entries,{level:6,mtime:new Date(1980,0,1)}),name='mermaid-bp-web.zip';
  await mkdir(out,{recursive:true});
  await writeFile(resolve(out,name),archive);
  await writeFile(resolve(out,name+'.sha256'),createHash('sha256').update(archive).digest('hex')+'  '+name+'\n');
  return {file:resolve(out,name),entries:Object.keys(entries).length};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const result=await packageWeb();console.log('Paquete Nginx listo: '+relative(process.cwd(),result.file)+' ('+result.entries+' archivos).');
}
