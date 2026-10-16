import {readFile,readdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';

const licenseFile=/^(?:licen[cs]e|copying|notice)(?:\..*)?$/i;

export async function writeThirdPartyNotices(root=process.cwd(),out=resolve(root,'dist')){
  const lock=JSON.parse(await readFile(join(root,'package-lock.json'),'utf8'));
  const packages=Object.entries(lock.packages)
    .filter(([path,details])=>path.startsWith('node_modules/')&&!details.dev)
    .sort(([left],[right])=>left.localeCompare(right));
  const sections=['# Licencias de componentes de terceros','',
    'Estos componentes conservan sus licencias y avisos originales. Su inclusión no cambia la licencia del código original de Mermaid BP.',''];
  for(const [path,details] of packages){
    const directory=join(root,path);
    const files=(await readdir(directory,{withFileTypes:true}))
      .filter(item=>item.isFile()&&licenseFile.test(item.name))
      .map(item=>item.name).sort();
    let notices=[];
    for(const file of files)notices.push([file,(await readFile(join(directory,file),'utf8')).trim()]);
    if(!notices.length){
      const readme=(await readdir(directory)).find(file=>/^readme(?:\..*)?$/i.test(file));
      if(readme){
        const body=await readFile(join(directory,readme),'utf8');
        const match=body.match(/^#{1,3}\s+Licen[cs]e\s*$([\s\S]*?)(?=^#{1,3}\s+|$)/im);
        if(match)notices=[[readme,match[1].trim()]];
      }
    }
    if(!notices.length)throw Error(`No se encontró el aviso de licencia: ${path}`);
    sections.push(`## ${path.slice('node_modules/'.length)} ${details.version} — ${details.license??'licencia en el texto adjunto'}`,'');
    for(const [file,body] of notices)sections.push(`### ${file}`,'',body,'');
  }
  await writeFile(join(out,'THIRD_PARTY_NOTICES.md'),sections.join('\n')+'\n');
  return packages.length;
}
