import {isTauri} from '@tauri-apps/api/core';
import {check} from '@tauri-apps/plugin-updater';
import {relaunch} from '@tauri-apps/plugin-process';
import {mountUpdaterView} from './updater-view';

export function setupDesktopUpdater(general:HTMLElement):void{
 if(!isTauri())return;
 mountUpdaterView(general,{check,relaunch});
}
