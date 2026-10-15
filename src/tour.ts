import type {GuideStep} from './plugin-api';
export function setupTour(extra:()=>GuideStep[],pane:()=> 'code'|'cascade',setPane:(mode:'code'|'cascade')=>void){
 const dialog=document.createElement('dialog');dialog.id='tour-dialog';dialog.setAttribute('aria-labelledby','tour-title');dialog.innerHTML='<p id="tour-progress"></p><h2 id="tour-title"></h2><p id="tour-description"></p><div class="dialog-actions"><button id="tour-close">Cerrar guía</button><button id="tour-back">Anterior</button><button id="tour-next" class="primary">Siguiente</button></div>';document.getElementById('app')!.append(dialog);
 const get=(id:string)=>document.getElementById(id)!;let steps:GuideStep[]=[],index=0,previous:'code'|'cascade'='code',restoreToolbar=false;
 const clear=()=>document.querySelectorAll('.tour-target').forEach(el=>el.classList.remove('tour-target'));
 function show(){clear();const step=steps[index];if(step.pane)setPane(step.pane);document.querySelector(step.target)?.classList.add('tour-target');get('tour-progress').textContent=`Paso ${index+1} de ${steps.length}`;get('tour-title').textContent=step.title;get('tour-description').textContent=step.description;(get('tour-back')as HTMLButtonElement).disabled=index===0;get('tour-next').textContent=index===steps.length-1?'Finalizar':'Siguiente';}
 get('tour-close').onclick=()=>dialog.close();get('tour-back').onclick=()=>{index--;show();};get('tour-next').onclick=()=>{if(index===steps.length-1)dialog.close();else{index++;show();}};
 dialog.onclose=()=>{clear();setPane(previous);if(restoreToolbar)get('toolbar-toggle').click();};
 get('tour-button').onclick=()=>{previous=pane();restoreToolbar=get('toolbar-toggle').getAttribute('aria-expanded')==='false';if(restoreToolbar)get('toolbar-toggle').click();steps=[
 {id:'code',title:'Código Mermaid',description:'Escribe o abre un archivo .mmd. El diagrama se actualiza al editar. Guarda el archivo para conservarlo fuera del navegador.',target:'#editor',pane:'code'},
 {id:'cascade',title:'Cascada',description:'Busca nodos y subgrupos. Al seleccionar un elemento puedes consultar sus relaciones y editarlo en el panel de información.',target:'#cascade',pane:'cascade'},
 {id:'info',title:'Información del nodo',description:'Selecciona un nodo para abrir su información. Arrastra el separador superior para cambiar la altura. Ir a centra el nodo sin cambiar el zoom y lo resalta durante unos segundos.',target:'.code-pane'},
 {id:'diagram',title:'Diagrama',description:'La rueda cambia el zoom. Espacio y arrastre desplaza la cámara. Arrastra nodos para moverlos. Encajar muestra todo; pantalla completa amplía el espacio de trabajo.',target:'#diagram-viewport'},
 ...extra(),{id:'plugins',title:'Extensiones y archivos',description:'Activa o desactiva funciones en Extensiones. Puedes trabajar solo con Mermaid y exportar a SVG o PNG. El borrador se conserva en este navegador.',target:'#plugins-button'}];index=0;dialog.showModal();show();};
}
