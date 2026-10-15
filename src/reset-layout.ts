/** Retira solo los ajustes de distribución del editor; conserva el diagrama y sus estilos. */
export function resetLayout(source:string):string {
  const newline=source.includes('\r\n')?'\r\n':'\n';
  let managed=false;
  return source.split(/\r?\n/).filter(line=>{
    const text=line.trim();
    if(text==='%% mbp-layout:start'){managed=true;return false;}
    if(text==='%% mbp-layout:end'){managed=false;return false;}
    if(managed)return false;
    return !/^%%\s*graph:(?:positions|connections|groups)\s/.test(text)&&text!=='%% mermaid-bp:manual-layout';
  }).join(newline);
}
