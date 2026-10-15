import {installedPlugins} from './plugin-config.ts';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
for(const plugin of installedPlugins())if(plugin.manifest.apiVersion===1&&plugin.manifest.build?.script){
  await import(pathToFileURL(resolve(plugin.directory,plugin.manifest.build.script)).href);
}
