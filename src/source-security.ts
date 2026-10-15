/** Política común para archivos, código pegado y el visor BookStack. */
export const MAX_SOURCE_BYTES=200_000;
const TYPES=/^(?:flowchart|graph|sequenceDiagram|classDiagram(?:-v2)?|stateDiagram(?:-v2)?|erDiagram|gantt|pie|journey|gitGraph|mindmap|timeline|quadrantChart|requirementDiagram|sankey-beta|xychart-beta|kanban|architecture-beta|block-beta|packet-beta|radar-beta|treemap-beta)\b/;
const FORBIDDEN_CONFIG=new Set(['secure','securityLevel','startOnLoad','maxTextSize','maxEdges','themeCSS','fontFamily','altFontFamily','themeVariables','dompurifyConfig']);
function checkConfig(value:unknown,depth=0):void {
 if(typeof value==='number'&&(!Number.isFinite(value)||Math.abs(value)>10_000))throw Error('La configuración numérica supera los límites permitidos.');
 if(depth>12)throw Error('La configuración supera la profundidad permitida.');
 if(value&&typeof value==='object')for(const [key,item]of Object.entries(value)){
  if(['__proto__','prototype','constructor'].includes(key)||FORBIDDEN_CONFIG.has(key))throw Error('El archivo intenta modificar opciones reservadas de seguridad o estilos globales.');
  checkConfig(item,depth+1);
 }
}
export function assertSourceSafe(source:string):void {
 if(new TextEncoder().encode(source).byteLength>MAX_SOURCE_BYTES)throw Error('El Mermaid supera el límite de 200 kB.');
 if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(source))throw Error('El archivo contiene datos binarios o caracteres de control.');
 if(source.split('\n').length>4000)throw Error('El Mermaid supera el límite de 4000 líneas.');
 if(/^\s*---/.test(source))throw Error('No se admite configuración YAML en archivos públicos.');
 if(/<\s*\/?\s*(?:script|iframe|object|embed|form|input|link|meta|base|style|svg|math|image|img|a)\b/i.test(source)||/\bon[a-z]+\s*=/i.test(source))throw Error('El Mermaid contiene HTML activo o manejadores de eventos no permitidos.');
 if(/(?:javascript|vbscript|file)\s*:/i.test(source)||/(?:url\s*\(|@import|expression\s*\()/i.test(source)||/(?:^|[\n;])\s*click\b/i.test(source))throw Error('No se permiten scripts, acciones de clic ni recursos externos en los diagramas.');
 if(/\b(?:img|image)\s*:/i.test(source))throw Error('No se permiten imágenes externas en los diagramas.');
 let plain=source.replace(/^\uFEFF/,'');
 plain=plain.replace(/%%\{\s*(?:init|initialize)\s*:\s*([\s\S]*?)\}%%/g,(_all,json:string)=>{
  let config:unknown;try{config=JSON.parse(json);}catch{throw Error('La directiva de configuración debe usar JSON válido.');}checkConfig(config);return '';
 });
 if(/%%\{/.test(plain))throw Error('Directiva Mermaid no admitida.');
 plain=plain.split('\n').filter(line=>!/^\s*%%/.test(line)).join('\n').trimStart();
 if(!TYPES.test(plain))throw Error('El contenido no empieza por un tipo de diagrama Mermaid admitido.');
 for(const line of source.split('\n')){
  const css=line.match(/(?:^|;)\s*(?:style|classDef)\s+\S+\s+(.+)$/)?.[1];
  if(css&&(/[{}<>\\@]/.test(css)||/\b(?:font-size|stroke-width)\s*:\s*\d{4,}/i.test(css)))throw Error('El diagrama contiene una declaración de estilo no permitida.');
  const metadata=line.match(/^\s*%% graph:(?:positions|groups|connections)\s+(.+)$/)?.[1];
  if(metadata){
   try{JSON.parse(metadata,(key,value)=>{if(['__proto__','prototype','constructor'].includes(key))throw Error();if(typeof value==='number'&&(!Number.isFinite(value)||Math.abs(value)>1_000_000))throw Error();return value;});}
   catch{throw Error('Los datos de posición del diagrama no son válidos.');}
  }
 }
}
export async function readMmdFile(file:File):Promise<string>{
 if(!/\.mmd$/i.test(file.name))throw Error('Solo se admiten archivos con extensión .mmd.');
 if(file.size===0||file.size>MAX_SOURCE_BYTES)throw Error('El archivo debe contener texto Mermaid y ocupar como máximo 200 kB.');
 let source:string;try{source=new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer());}catch{throw Error('El archivo debe ser texto UTF-8 válido.');}
 assertSourceSafe(source);return source;
}

/** Las etiquetas HTML se desactivan sin alterar el documento original. */
export function prepareSource(source:string):string {
 assertSourceSafe(source);
 return source.replace(/%%\{\s*(?:init|initialize)\s*:\s*([\s\S]*?)\}%%/g,(_all,json:string)=>{
  const config=JSON.parse(json,(_key,value)=>_key==='htmlLabels'?false:value);
  return '%%{init: '+JSON.stringify(config)+'}%%';
 });
}
