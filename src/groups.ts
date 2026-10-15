import { tagManualLayout } from './positions.ts';
export interface GroupBox { x:number; y:number; width:number; height:number }
export type GroupBoxes = Record<string,GroupBox>;
const prefix='%% graph:groups ';
export function readGroups(source:string):GroupBoxes {
  const result:GroupBoxes=Object.create(null);
  for(const line of source.split(/\r?\n/)) {
    if(!line.trimStart().startsWith(prefix))continue;
    try {
      const entries=JSON.parse(line.trimStart().slice(prefix.length));
      if(!entries||typeof entries!=='object'||Array.isArray(entries))continue;
      for(const[id,value]of Object.entries(entries)) {
        const b=value as GroupBox;
        if(b&&[b.x,b.y,b.width,b.height].every(n=>Number.isFinite(n)&&Math.abs(n)<1e7)&&b.width>=40&&b.height>=40)
          result[id]={x:b.x,y:b.y,width:b.width,height:b.height};
      }
    }catch{/* Un comentario incompleto no impide abrir el diagrama. */}
  }
  return result;
}
export function writeGroups(source:string,groups:GroupBoxes):string {
  source=tagManualLayout(source);
  const newline=source.includes('\r\n')?'\r\n':'\n',lines=source.split(/\r?\n/);
  const line=prefix+JSON.stringify(groups),existing=lines.findIndex(l=>l.trimStart().startsWith(prefix));
  if(existing<0)return source+(source.endsWith('\n')?'':newline)+line+newline;
  lines[existing]=line;
  return lines.filter((l,i)=>i===existing||!l.trimStart().startsWith(prefix)).join(newline);
}
