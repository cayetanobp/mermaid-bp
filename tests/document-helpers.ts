import {readFile} from 'node:fs/promises';
import {expect,type Page} from '@playwright/test';
import {command} from './menu-helpers';
/** Comprobar la persistencia explícita mediante el archivo descargado, sin borradores. */
export async function reopenSavedDocument(page:Page){
 const pending=page.waitForEvent('download');await command(page,'save');const download=await pending;
 const buffer=await readFile((await download.path())!);await page.reload();await expect(page.locator('#render-state')).toHaveText('Actualizado');
 await command(page,'save');await page.locator('#file').setInputFiles({name:download.suggestedFilename(),mimeType:'text/plain',buffer});await expect(page.locator('#render-state')).toHaveText('Actualizado');
}
/** La vista previa recibe el documento actual por el canal temporal del plugin. */
export async function openBookStack(page:Page){const pending=page.context().waitForEvent('page');await command(page,'plugin-bookstack-preview');const check=await pending;await check.waitForLoadState();await expect(check.locator('#check-state')).toContainText('Renderizado con');return check;}

export async function documentText(page:Page){const pending=page.waitForEvent('download');await command(page,'save');const download=await pending;return readFile((await download.path())!,'utf8');}
