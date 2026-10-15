import descriptors from 'virtual:editor-plugins';
export { descriptors };
const key='mermaid-bp:plugins:v1';
export function enabledPreference(id:string, fallback:boolean):boolean {
  try { const value=JSON.parse(localStorage.getItem(key)||'{}')[id];return typeof value==='boolean'?value:fallback; }
  catch { return fallback; }
}
export function savePluginPreference(id:string,enabled:boolean) {
  try { const previous=JSON.parse(localStorage.getItem(key)||'{}');localStorage.setItem(key,JSON.stringify({...previous,[id]:enabled})); } catch { /* La sesión sigue funcionando sin almacenamiento. */ }
}
export function isPluginEnabled(id:string):boolean {
  const plugin=descriptors.find(p=>p.manifest.id===id);
  return !!plugin&&plugin.manifest.apiVersion===1&&enabledPreference(id,plugin.manifest.enabledByDefault!==false);
}
