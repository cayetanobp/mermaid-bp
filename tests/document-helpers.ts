import {readFile} from 'node:fs/promises';
import {expect,type Page} from '@playwright/test';
import {command} from './menu-helpers';
/** Comprobar la persistencia explícita mediante el archivo descargado, sin borradores. */
export async function reopenSavedDocument(page:Page){
 const pending=page.waitForEvent('download');await command(page,'save');const download=await pending;
 const buffer=await readFile((await download.path())!);await page.reload();await expect(page.locator('#render-state')).toHaveText('Actualizado');
 await command(page,'save');await page.locator('#file').setInputFiles({name:download.suggestedFilename(),mimeType:'text/plain',buffer});await expect(page.locator('#render-state')).toHaveText('Actualizado');
}
export async function documentText(page:Page){const pending=page.waitForEvent('download');await command(page,'save');const download=await pending;return readFile((await download.path())!,'utf8');}
