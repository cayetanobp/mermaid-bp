/** Menús de aplicación. Se trasladan los controles originales para conservar sus acciones. */
let closeMenus: (restoreFocus?:boolean)=>void = ()=>{};
let revealTarget: (target:Element|null)=>void = ()=>{};
export const closeAppMenus=(restoreFocus=false)=>closeMenus(restoreFocus);
export const revealMenuTarget=(selector:string)=>revealTarget(document.querySelector(selector));

export function setupAppMenus(){
 const get=(id:string)=>document.getElementById(id)!;
 const oldHeader=document.querySelector('.topbar')!,oldToolbar=get('file-toolbar'),oldVisual=document.querySelector('.visual-toolbar')!;
 const header=document.createElement('header');header.className='topbar app-menubar';
 const nav=document.createElement('nav');nav.className='app-menu-list';nav.setAttribute('role','menubar');nav.setAttribute('aria-label','Menú principal');
 header.append(oldHeader.querySelector('.brand')!,nav,oldHeader.querySelector('.file-state')!);
 oldHeader.before(header);
 const local=oldHeader.querySelector('.local-badge')!;local.classList.add('menu-local');document.querySelector('.statusbar')!.append(local,get('visual-mode'));
 const triggers:HTMLButtonElement[]=[],panels:HTMLElement[]=[];let opened=-1;
 const items=(panel:HTMLElement)=>[...panel.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],select:not(:disabled)')].filter(el=>!el.hidden);
 function position(index:number){const rect=triggers[index].getBoundingClientRect(),panel=panels[index];panel.style.left=Math.max(8,Math.min(rect.left,innerWidth-panel.offsetWidth-8))+'px';panel.style.top=(rect.bottom+3)+'px';}
 function close(restoreFocus=false){const previous=opened;for(const panel of panels)panel.hidden=true;triggers.forEach(button=>button.setAttribute('aria-expanded','false'));opened=-1;if(restoreFocus&&previous>=0)triggers[previous].focus({preventScroll:true});}
 function open(index:number,focus:'first'|'last'|false=false){close();opened=index;panels[index].hidden=false;triggers[index].setAttribute('aria-expanded','true');triggers.forEach((button,i)=>button.tabIndex=i===index?0:-1);position(index);if(focus){const entries=items(panels[index]);(focus==='first'?entries[0]:entries.at(-1))?.focus();}}
 function group(id:string,label:string){
  const button=document.createElement('button');button.id='menu-'+id;button.type='button';button.className='app-menu-trigger';button.textContent=label;button.setAttribute('role','menuitem');button.setAttribute('aria-haspopup','menu');button.setAttribute('aria-expanded','false');button.tabIndex=triggers.length? -1:0;
  const panel=document.createElement('div');panel.id='menu-'+id+'-panel';panel.className='app-menu-panel';panel.hidden=true;panel.setAttribute('role','menu');panel.setAttribute('aria-labelledby',button.id);button.setAttribute('aria-controls',panel.id);
  const index=triggers.length;triggers.push(button);panels.push(panel);nav.append(button,panel);
  button.onclick=()=>opened===index?close():open(index);
  button.onpointerenter=()=>{if(opened>=0&&opened!==index)open(index);};
  button.onkeydown=event=>{if(['ArrowDown','ArrowUp','Enter',' '].includes(event.key)){event.preventDefault();open(index,event.key==='ArrowUp'?'last':'first');}else if(['ArrowRight','ArrowLeft','Home','End'].includes(event.key)){event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?triggers.length-1:(index+(event.key==='ArrowRight'?1:-1)+triggers.length)%triggers.length;const wasOpen=opened>=0;close();triggers.forEach((trigger,i)=>trigger.tabIndex=i===next?0:-1);triggers[next].focus();if(wasOpen)open(next);}else if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close(true);}};
  panel.onkeydown=event=>{
   if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close(true);return;}
   if(event.key==='Tab'){close();return;}
   if(event.target instanceof HTMLSelectElement)return;
   const entries=items(panel),current=entries.indexOf(document.activeElement as HTMLElement);
   if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?entries.length-1:(current+(event.key==='ArrowDown'?1:-1)+entries.length)%entries.length;entries[next]?.focus();}
   else if(['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();open((index+(event.key==='ArrowRight'?1:-1)+triggers.length)%triggers.length,'first');}
  };
  panel.addEventListener('click',event=>{const action=(event.target as Element).closest('button,a');if(!action)return;queueMicrotask(()=>{if(opened!==index)return;const restore=panel.contains(document.activeElement)&&!document.querySelector('dialog[open]');close(restore);});});
  return panel;
 }
 function action(panel:HTMLElement,id:string,label?:string){const element=get(id);if(label)element.textContent=label;element.classList.remove('primary');element.classList.add('app-menu-command');element.setAttribute('role','menuitem');
  if(element.hasAttribute('aria-pressed')){element.setAttribute('role','menuitemcheckbox');const sync=()=>element.setAttribute('aria-checked',String(element.getAttribute('aria-pressed')==='true'));sync();new MutationObserver(sync).observe(element,{attributes:true,attributeFilter:['aria-pressed']});}
  element.tabIndex=-1;panel.append(element);return element;}
 function divider(panel:HTMLElement){const line=document.createElement('hr');line.setAttribute('role','separator');panel.append(line);}
 const file=group('archivo','Archivo');for(const [id,label]of [['new','Nuevo'],['open','Abrir .mmd…'],['save','Guardar .mmd']])action(file,id,label);
 const saveShortcut=document.createElement('kbd');saveShortcut.textContent='Ctrl S';get('save').append(saveShortcut);
 divider(file);action(file,'copy');action(file,'svg','Exportar SVG');action(file,'png','Exportar PNG');header.append(get('file'));
 const edit=group('edicion','Edición');action(edit,'undo','Deshacer');action(edit,'redo','Rehacer');
 const view=group('ver','Ver');
 for(const [id,text,tab]of [['view-code','Código','tab-code'],['view-cascade','Cascada','tab-cascade']]){const button=document.createElement('button');button.id=id;button.textContent=text;button.type='button';button.setAttribute('role','menuitem');button.tabIndex=-1;button.onclick=()=>get(tab).click();view.append(button);}
 divider(view);action(view,'fit-view');
 get('diagram-viewport').append(get('diagram-fullscreen'));
 const contributions=document.createElement('div');contributions.className='plugin-menu-section';divider(contributions);contributions.append(get('plugin-actions'));view.append(contributions);
 const diagram=group('diagrama','Diagrama');action(diagram,'add-node','Nuevo nodo');action(diagram,'add-edge','Nueva conexión');action(diagram,'connect-nodes');action(diagram,'manage-groups');divider(diagram);action(diagram,'relayout');
 const direction=get('direction').closest('label')!;direction.classList.add('app-menu-field');get('direction').tabIndex=-1;diagram.append(direction);
 const config=group('configuracion','Configuración');const preferences=document.createElement('button');preferences.id='settings-button';preferences.type='button';preferences.textContent='Preferencias…';preferences.setAttribute('role','menuitem');preferences.tabIndex=-1;config.append(preferences);action(config,'plugins-button');
 const help=group('ayuda','Ayuda');action(help,'tour-button');
 const exit=document.createElement('button');exit.id='diagram-exit-fullscreen';exit.type='button';exit.textContent='Salir de pantalla completa';exit.onclick=()=>get('diagram-fullscreen').click();header.append(exit);
 document.getElementById('app')!.prepend(header);oldHeader.remove();oldToolbar.remove();oldVisual.remove();
 new MutationObserver(()=>{for(const item of get('plugin-actions').querySelectorAll<HTMLElement>('button,a')){item.setAttribute('role','menuitem');item.tabIndex=-1;}}).observe(get('plugin-actions'),{childList:true});
 closeMenus=close;revealTarget=target=>{const index=panels.findIndex(panel=>!!target&&panel.contains(target));if(index>=0)open(index);else close();};
 document.addEventListener('pointerdown',event=>{if(!header.contains(event.target as Node))close();},true);
 window.addEventListener('resize',()=>{if(opened>=0)position(opened);});nav.addEventListener('scroll',()=>{if(opened>=0)position(opened);});
}
