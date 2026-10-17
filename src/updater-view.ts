export interface UpdaterRelease {
 currentVersion:string;
 version:string;
 body?:string;
 downloadAndInstall:()=>Promise<void>;
 close?:()=>Promise<void>;
}

export function mountUpdaterView(general:HTMLElement,dependencies:{check:()=>Promise<UpdaterRelease|null>;relaunch:()=>Promise<void>}):void{
 const updates=document.createElement('section');
 updates.id='desktop-updates';
 updates.innerHTML='<h3>Actualizaciones</h3><p id="update-current-version"></p><div id="update-details" hidden><p id="update-version"></p><p id="update-notes"></p></div><p id="update-status" role="status" aria-live="polite"></p><button id="check-updates" type="button">Buscar actualizaciones</button><button id="install-update" type="button" hidden>Descargar e instalar</button>';
 general.append(updates);
 const status=updates.querySelector<HTMLElement>('#update-status')!;
 const checkButton=updates.querySelector<HTMLButtonElement>('#check-updates')!;
 const installButton=updates.querySelector<HTMLButtonElement>('#install-update')!;
 let pending:UpdaterRelease|null=null;
 const release=()=>{pending?.close?.().catch(()=>{});pending=null;};
 general.closest('dialog')?.addEventListener('close',release);
 const detail=(error:unknown)=>error instanceof Error?error.message:String(error);
 checkButton.onclick=async()=>{
  checkButton.disabled=true;installButton.hidden=true;updates.querySelector('#update-details')!.setAttribute('hidden','');updates.querySelector('#update-current-version')!.textContent='';status.textContent='Buscando actualizaciones…';release();
  try{
   pending=await dependencies.check();
   if(!pending){status.textContent='No hay actualizaciones disponibles.';return;}
   updates.querySelector('#update-current-version')!.textContent='Versión instalada: '+pending.currentVersion;
   updates.querySelector('#update-version')!.textContent='Nueva versión: '+pending.version;
   updates.querySelector('#update-notes')!.textContent=pending.body||'Esta versión no incluye notas.';
   updates.querySelector('#update-details')!.removeAttribute('hidden');installButton.hidden=false;status.textContent='Hay una actualización disponible.';
  }catch(error){status.textContent='No se pudo buscar actualizaciones. Comprueba tu conexión e inténtalo de nuevo. '+detail(error);}
  finally{checkButton.disabled=false;}
 };
 installButton.onclick=async()=>{
  if(!pending)return;
  installButton.disabled=true;checkButton.disabled=true;status.textContent='Descargando y verificando la actualización…';
  try{
   await pending.downloadAndInstall();pending=null;installButton.hidden=true;status.textContent='Actualización instalada. Reiniciando la aplicación…';
   try{await dependencies.relaunch();}catch(error){status.textContent='La actualización se instaló, pero no se pudo reiniciar automáticamente. Cierra y vuelve a abrir la aplicación. '+detail(error);checkButton.disabled=false;}
  }catch(error){status.textContent='No se pudo instalar la actualización. La versión instalada y tus datos siguen disponibles. '+detail(error);installButton.disabled=false;checkButton.disabled=false;}
 };
}
