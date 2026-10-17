interface DesktopCore {
  invoke<T>(command:string,args?:Record<string,unknown>):Promise<T>;
  convertFileSrc(path:string,protocol?:string):string;
}
interface DesktopWindow extends Window { __TAURI__?: { core:DesktopCore } }
export interface PluginFolderSelection { folderName:string; paths:string[]; contents:string[] }

export function pluginAssetPath(root:string,id:string,file:string):string {
  const separator=root.includes('\\')?'\\':'/';
  const relative=file.split(/[\\/]+/).join(separator);
  return `${root.replace(/[\\/]+$/,'')}${separator}${id}${separator}${relative}`;
}

export function desktopPluginBridge():DesktopCore|null {
  return (window as DesktopWindow).__TAURI__?.core??null;
}

export async function listLocalPlugins():Promise<string[]> {
  const bridge=desktopPluginBridge();
  if(!bridge)return [];
  const plugins=await bridge.invoke<Array<{id?:unknown}>>('list_plugins');
  return plugins.flatMap(plugin=>typeof plugin.id==='string'?[plugin.id]:[]);
}

export async function localPluginUrl(id:string,file:string):Promise<string> {
  const bridge=desktopPluginBridge();
  if(!bridge)throw Error('La gestión local solo está disponible en la aplicación de escritorio.');
  const root=await bridge.invoke<string>('plugins_root');
  return bridge.convertFileSrc(pluginAssetPath(root,id,file),'asset');
}

export async function installLocalPlugin(id:string,paths:string[],contents:string[]):Promise<string> {
  const bridge=desktopPluginBridge();
  if(!bridge)throw Error('La gestión local solo está disponible en la aplicación de escritorio.');
  await bridge.invoke<void>('install_plugin',{id,paths,contents});
  return `Plugin ${id} instalado o actualizado.`;
}

export async function chooseLocalPluginFolder():Promise<PluginFolderSelection|null> {
  const bridge=desktopPluginBridge();
  if(!bridge)throw Error('La gestión local solo está disponible en la aplicación de escritorio.');
  return bridge.invoke<PluginFolderSelection|null>('choose_plugin_folder');
}

export async function removeLocalPlugin(id:string):Promise<boolean> {
  const bridge=desktopPluginBridge();
  if(!bridge)throw Error('La gestión local solo está disponible en la aplicación de escritorio.');
  return bridge.invoke<boolean>('remove_plugin',{id});
}
