export interface Preferences {
 defaultPane:'remember'|'code'|'cascade';
 editorFontSize:number;
 lineWrapping:boolean;
 lineNumbers:boolean;
 highlightActiveLine:boolean;
 showGrid:boolean;
 showHints:boolean;
 motion:'system'|'reduce';
 zoomSpeed:number;
}
export const preferenceDefaults:Readonly<Preferences>=Object.freeze({defaultPane:'remember',editorFontSize:12,lineWrapping:true,lineNumbers:true,highlightActiveLine:true,showGrid:true,showHints:true,motion:'system',zoomSpeed:1});
const key='mermaid-bp:preferences:v1';
function validate(value:unknown):Preferences{
 const raw=value&&typeof value==='object'?value as Record<string,unknown>:{};
 const result={...preferenceDefaults};
 if(['remember','code','cascade'].includes(String(raw.defaultPane)))result.defaultPane=raw.defaultPane as Preferences['defaultPane'];
 if(typeof raw.editorFontSize==='number'&&Number.isInteger(raw.editorFontSize)&&raw.editorFontSize>=10&&raw.editorFontSize<=24)result.editorFontSize=raw.editorFontSize;
 for(const field of ['lineWrapping','lineNumbers','highlightActiveLine','showGrid','showHints'] as const)if(typeof raw[field]==='boolean')result[field]=raw[field];
 if(raw.motion==='system'||raw.motion==='reduce')result.motion=raw.motion;
 if(typeof raw.zoomSpeed==='number'&&[.5,.75,1,1.5,2].includes(raw.zoomSpeed))result.zoomSpeed=raw.zoomSpeed;
 return result;
}
function read(){try{return validate(JSON.parse(localStorage.getItem(key)||'null'));}catch{return{...preferenceDefaults};}}
let current=read();
const listeners=new Set<(preferences:Readonly<Preferences>)=>void>();
export const getPreferences=():Readonly<Preferences>=>({...current});
export function subscribePreferences(listener:(preferences:Readonly<Preferences>)=>void){listeners.add(listener);return()=>{listeners.delete(listener);};}
export function updatePreferences(patch:Partial<Preferences>):boolean{
 current=validate({...current,...patch});let saved=true;
 try{localStorage.setItem(key,JSON.stringify(current));}catch{saved=false;}
 for(const listener of listeners)listener(getPreferences());return saved;
}
if(typeof window!=='undefined')window.addEventListener('storage',event=>{if(event.key!==key&&event.key!==null)return;const next=read();if(JSON.stringify(next)===JSON.stringify(current))return;current=next;for(const listener of listeners)listener(getPreferences());});
