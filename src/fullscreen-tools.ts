/** Accesos directos del menú Diagrama, visibles solo al ampliar el lienzo. */
export function setupFullscreenTools(){
 const app=document.getElementById('app')!,bar=document.createElement('div');bar.id='fullscreen-diagram-tools';bar.setAttribute('role','toolbar');bar.setAttribute('aria-label','Herramientas del diagrama');
 const title=document.createElement('span');title.className='fullscreen-tools-title';title.textContent='Diagrama';bar.append(title);
 const sync:Array<()=>void>=[];
 for(const id of ['add-node','add-edge','connect-nodes','manage-groups','fit-view','relayout']){
  const original=document.getElementById(id) as HTMLButtonElement,button=document.createElement('button');button.id='fullscreen-'+id;button.type='button';button.textContent=original.textContent;button.title=original.title;
  button.onclick=()=>original.click();const update=()=>{button.disabled=original.disabled;if(original.hasAttribute('aria-pressed'))button.setAttribute('aria-pressed',original.getAttribute('aria-pressed')!);};sync.push(update);update();
  new MutationObserver(update).observe(original,{attributes:true,attributeFilter:['disabled','aria-pressed']});bar.append(button);
 }
 const original=document.getElementById('direction') as HTMLSelectElement,select=original.cloneNode(true) as HTMLSelectElement;select.id='fullscreen-direction';select.removeAttribute('tabindex');
 const label=document.createElement('label');label.textContent='Dirección ';label.append(select);bar.append(label);
 const update=()=>{select.disabled=original.disabled;select.value=original.value;};sync.push(update);update();new MutationObserver(update).observe(original,{attributes:true,childList:true,subtree:true});
 select.onchange=()=>{original.value=select.value;original.dispatchEvent(new Event('change',{bubbles:true}));};original.addEventListener('change',update);
 new MutationObserver(()=>sync.forEach(update=>update())).observe(app,{attributes:true,attributeFilter:['class']});
 bar.addEventListener('keydown',event=>{
  if(event.code==='Space')event.stopPropagation();
  if(event.target instanceof HTMLSelectElement||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  event.preventDefault();const controls=[...bar.querySelectorAll<HTMLElement>('button:not(:disabled),select:not(:disabled)')],index=controls.indexOf(document.activeElement as HTMLElement);controls[event.key==='Home'?0:event.key==='End'?controls.length-1:(index+(event.key==='ArrowRight'?1:-1)+controls.length)%controls.length]?.focus();
 });
 document.getElementById('workspace')!.before(bar);
}
