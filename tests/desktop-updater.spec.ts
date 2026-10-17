import {test,expect} from '@playwright/test';
import {build} from 'esbuild';

async function mountHarness(page:import('@playwright/test').Page){
 const output=await build({entryPoints:['src/updater-view.ts'],bundle:true,format:'iife',globalName:'UpdaterView',write:false});
 await page.goto('/');
 await page.setContent('<dialog open><textarea id="document">flowchart LR\nA --> B</textarea><main id="general"></main></dialog>');
 await page.evaluate(()=>localStorage.setItem('mermaid-bp:draft:v1','flowchart LR\nA --> B'));
 await page.addScriptTag({content:output.outputFiles[0].text});
}

test('el updater muestra que no hay novedades y los errores conservan el borrador',async({page})=>{
 await mountHarness(page);
 await page.evaluate(()=>window.UpdaterView.mountUpdaterView(document.querySelector('#general')!,{getCurrentVersion:async()=>'1.0.0-beta.1',check:async()=>null,relaunch:async()=>{throw new Error('unexpected relaunch');}}));
 await page.getByRole('button',{name:'Buscar actualizaciones'}).click();
 await expect(page.getByRole('status')).toHaveText('No hay actualizaciones disponibles.');
 await expect(page.getByText('Versión instalada: 1.0.0-beta.1',{exact:true})).toBeVisible();
 expect(await page.locator('#document').inputValue()).toBe('flowchart LR\nA --> B');
 expect(await page.evaluate(()=>localStorage.getItem('mermaid-bp:draft:v1'))).toBe('flowchart LR\nA --> B');
});

test('el updater presenta versión y notas y conserva los datos si falla la descarga/verificación',async({page})=>{
 await mountHarness(page);
 await page.evaluate(()=>window.UpdaterView.mountUpdaterView(document.querySelector('#general')!,{check:async()=>({currentVersion:'1.0.0-beta.1',version:'1.0.0-beta.2',body:'Mejoras de accesibilidad.',downloadAndInstall:async()=>{throw new Error('firma no válida');}}),relaunch:async()=>{throw new Error('unexpected relaunch');}}));
 await page.getByRole('button',{name:'Buscar actualizaciones'}).click();
 await expect(page.getByText('Versión instalada: 1.0.0-beta.1')).toBeVisible();
 await expect(page.getByText('Nueva versión: 1.0.0-beta.2')).toBeVisible();
 await expect(page.getByText('Mejoras de accesibilidad.')).toBeVisible();
 await page.getByRole('button',{name:'Descargar e instalar'}).click();
 await expect(page.getByRole('status')).toContainText('No se pudo instalar la actualización. La versión instalada y tus datos siguen disponibles. firma no válida');
 expect(await page.locator('#document').inputValue()).toBe('flowchart LR\nA --> B');
 expect(await page.evaluate(()=>localStorage.getItem('mermaid-bp:draft:v1'))).toBe('flowchart LR\nA --> B');
 await expect(page.getByRole('button',{name:'Descargar e instalar'})).toBeEnabled();
});

test('si el relanzamiento falla después de completar el flujo, pide abrir de nuevo y no deja repetir la descarga',async({page})=>{
 await mountHarness(page);
 await page.evaluate(()=>window.UpdaterView.mountUpdaterView(document.querySelector('#general')!,{check:async()=>({currentVersion:'1.0.0-beta.1',version:'1.0.0-beta.2',downloadAndInstall:async()=>{}}),relaunch:async()=>{throw new Error('reinicio no disponible');}}));
 await page.getByRole('button',{name:'Buscar actualizaciones'}).click();
 await page.getByRole('button',{name:'Descargar e instalar'}).click();
 await expect(page.getByRole('status')).toContainText('no se pudo reiniciar automáticamente. Cierra y vuelve a abrir la aplicación. reinicio no disponible');
 await expect(page.getByRole('button',{name:'Descargar e instalar'})).toBeHidden();
 await expect(page.getByRole('button',{name:'Buscar actualizaciones'})).toBeEnabled();
 expect(await page.locator('#document').inputValue()).toBe('flowchart LR\nA --> B');
 expect(await page.evaluate(()=>localStorage.getItem('mermaid-bp:draft:v1'))).toBe('flowchart LR\nA --> B');
});

declare global{interface Window{UpdaterView:{mountUpdaterView:(general:HTMLElement,dependencies:{getCurrentVersion?:()=>Promise<string>;check:()=>Promise<{currentVersion:string;version:string;body?:string;downloadAndInstall:()=>Promise<void>}|null>;relaunch:()=>Promise<void>})=>void}}}
