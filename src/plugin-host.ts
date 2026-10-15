import { descriptors, enabledPreference, savePluginPreference } from './plugin-state';
import type { DocumentSnapshot, GuideStep, PluginContext, PluginDescriptor } from './plugin-api';
interface Active { cleanups: Array<()=>void>; listeners: Set<(snapshot:Readonly<DocumentSnapshot>)=>void>; steps: GuideStep[] }
export class PluginHost {
  private active=new Map<string,Active>();
  private pending=new Map<string,Active>();
  private versions=new Map<string,number>();
  private lastDocument='';
  private statuses=new Map<string,string>();
  constructor(private read:()=>DocumentSnapshot,private notify:(message:string)=>void,private installed:PluginDescriptor[]=descriptors) {}
  async start() {
    this.createManager();
    await Promise.all(this.installed.filter(d=>enabledPreference(d.manifest.id,d.manifest.enabledByDefault!==false)).map(d=>this.setEnabled(d.manifest.id,true,false)));
    this.refreshManager();
  }
  documentChanged() {
    const snapshot=Object.freeze({...this.read()}),key=JSON.stringify(snapshot);
    if(key===this.lastDocument)return;this.lastDocument=key;
    for(const [id,active] of this.active) for(const listener of active.listeners) {
      try { listener(snapshot); } catch { this.notify('Una extensión no ha podido actualizarse. El documento se conserva.');this.statuses.set(id,'Error al actualizar'); }
    }
  }
  guideSteps():GuideStep[] { return [...this.active.values()].flatMap(a=>a.steps); }
  async setEnabled(id:string,enabled:boolean,persist=true) {
    const descriptor=this.installed.find(d=>d.manifest.id===id);if(!descriptor)return;
    if(persist)savePluginPreference(id,enabled);
    const token=(this.versions.get(id)??0)+1;this.versions.set(id,token);
    this.dispose(id);
    if(!enabled){this.statuses.set(id,'Desactivado');this.refreshManager();return;}
    if(descriptor.manifest.apiVersion!==1){this.statuses.set(id,'Versión de API incompatible');this.refreshManager();return;}
    this.statuses.set(id,'Activando…');this.refreshManager();
    const owned:Active={cleanups:[],listeners:new Set(),steps:[]};
    this.pending.set(id,owned);
    const assertCurrent=()=>{if(this.versions.get(id)!==token)throw Error('Activación cancelada.');};
    try {
      const module=await descriptor.load();if(this.versions.get(id)!==token)return;
      if(typeof module.default?.setup!=='function')throw Error('La extensión no exporta setup.');
      const context:PluginContext={
        apiVersion:1,
        document:{
          read:()=>Object.freeze({...this.read()}),
          subscribe:listener=>{assertCurrent();owned.listeners.add(listener);const off=()=>{owned.listeners.delete(listener);};owned.cleanups.push(off);return off;},
        },
        ui:{
          notify:this.notify,
          addGuideStep:step=>{assertCurrent();if(owned.steps.some(s=>s.id===step.id))throw Error('Paso de guía duplicado.');owned.steps.push({...step});return()=>{owned.steps=owned.steps.filter(s=>s.id!==step.id);};},
          addAction:action=>{
            assertCurrent();
            if(!/^[a-z][a-z0-9-]*$/.test(action.id))throw Error('Identificador de acción no válido.');
            const elementId=`plugin-${id}-${action.id}`;if(document.getElementById(elementId))throw Error('Acción duplicada.');
            const element=action.href?document.createElement('a'):document.createElement('button');
            element.id=elementId;element.textContent=action.label;element.title=action.title??action.label;element.className='button plugin-action';element.dataset.plugin=id;
            if(element instanceof HTMLAnchorElement){const url=new URL(action.href!,document.baseURI);if(!['http:','https:'].includes(url.protocol))throw Error('Enlace no admitido.');element.href=url.href;element.target='_blank';element.rel='noopener';}
            else {element.type='button';element.onclick=()=>{try{Promise.resolve(action.run?.()).catch(()=>this.notify('La acción de la extensión no se ha podido completar.'));}catch{this.notify('La acción de la extensión no se ha podido completar.');}};}
            document.getElementById('plugin-actions')!.append(element);const remove=()=>element.remove();owned.cleanups.push(remove);return remove;
          },
        },
      };
      const cleanup=await module.default.setup(context);if(typeof cleanup==='function')owned.cleanups.push(cleanup);
      if(this.versions.get(id)!==token){this.cleanup(owned);return;}
      this.pending.delete(id);this.active.set(id,owned);this.statuses.set(id,'Activo');
    } catch {
      this.cleanup(owned);if(this.versions.get(id)!==token)return;this.pending.delete(id);this.statuses.set(id,'No se pudo activar');
      this.notify('No se ha podido activar una extensión. El editor sigue disponible.');
    }
    this.refreshManager();
  }
  private cleanup(active:Active) { for(const cleanup of [...active.cleanups].reverse())try{cleanup();}catch{/* Limpiar el resto aunque falle una contribución. */}active.cleanups=[];active.listeners.clear();active.steps=[]; }
  private dispose(id:string) {const pending=this.pending.get(id);if(pending)this.cleanup(pending);this.pending.delete(id);const active=this.active.get(id);if(active)this.cleanup(active);this.active.delete(id);}
  private createManager() {
    const dialog=document.createElement('dialog');dialog.id='plugins-dialog';dialog.setAttribute('aria-labelledby','plugins-title');
    dialog.innerHTML='<h2 id="plugins-title">Extensiones</h2><p class="dialog-intro">Activa las funciones que necesitas. Desactivarlas conserva tus documentos.</p><div id="plugin-list"></div><div class="dialog-actions"><button id="plugins-close" type="button">Cerrar</button></div>';
    document.getElementById('app')!.append(dialog);
    document.getElementById('plugins-close')!.onclick=()=>dialog.close();
    document.getElementById('plugins-button')!.onclick=()=>{this.refreshManager();dialog.showModal();};
  }
  private refreshManager() {
    const list=document.getElementById('plugin-list');if(!list)return;list.replaceChildren();
    if(!this.installed.length){const p=document.createElement('p');p.textContent='Esta compilación no incluye extensiones.';list.append(p);return;}
    for(const descriptor of this.installed){
      const m=descriptor.manifest,row=document.createElement('section');row.className='plugin-row';
      const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.dataset.pluginToggle=m.id;input.setAttribute('aria-label',`Activar ${m.name}`);input.checked=this.active.has(m.id);input.disabled=m.apiVersion!==1||this.statuses.get(m.id)==='Activando…';
      input.onchange=()=>{void this.setEnabled(m.id,input.checked);};
      const name=document.createElement('span');name.textContent=m.name;label.append(input,name);
      const description=document.createElement('p');description.textContent=m.description;
      const status=document.createElement('small');status.dataset.pluginStatus=m.id;status.textContent=`${this.statuses.get(m.id)??'Desactivado'} · ${m.version}`;
      row.append(label,description,status);list.append(row);
    }
  }
}
