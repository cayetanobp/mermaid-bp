import {discardLegacyDraft} from './privacy';
import {sameEdgeLabel} from './edge-label';
import {mermaidSourceId} from './mermaid-id';
import {assertSourceSafe,readMmdFile} from './source-security';
import { EditorState, Transaction, Compartment } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection } from '@codemirror/view';
import { history, historyKeymap, defaultKeymap, undo, redo, isolateHistory } from '@codemirror/commands';
import { bracketMatching } from '@codemirror/language';
import { example, parseFlow, serializeFlow, nextId, removeNode, edgePathMap, type Flow, type Shape, type Direction } from './flow';
import type { Point } from './layout';
import { ManualLayout } from './manual-layout';
import {readGroups,writeGroups,type GroupBox} from './groups';
import { writePositions,hasManualLayout } from './positions';
import {assignGroup,saveGroup,deleteGroup,groupPath} from './subgroups';
import { readConnections, writeConnections, type Connections } from './connections';
import { renderDiagram, download, pngBlob, svgDocument, type Rendered, validateMermaid } from './render';
import { setupWorkspaceControls } from './workspace-controls';
import {resetLayout} from './reset-layout';
import './style.css';
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-500.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/source-serif-4/latin-600.css';
import './institutional.css';
import {PluginHost} from './plugin-host';
import {setupInspectorResize} from './inspector-resize';
import {locateNode,highlightNode,clearNodeLocation} from './node-location';
import {setupTour} from './tour';
import {setupAppMenus} from './app-menus';
import {setupFullscreenTools} from './fullscreen-tools';
import './app-menus.css';
import {getPreferences} from './preferences';
import {setupSettings} from './settings';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
discardLegacyDraft();
const app = $('app');
app.innerHTML = `
  <header class="topbar">
    <a class="brand" href="./" aria-label="Mermaid BP, inicio"><span class="brand-mark">m<span>↗</span></span><span>mermaid<span class="brand-bp"> / bp</span></span></a>
    <div class="file-state"><span class="status-dot"></span><span id="filename">diagrama.mmd</span><span id="dirty" aria-label="Cambios sin descargar">●</span></div>
    <span class="local-badge">local · sin cuenta</span>
    <button id="tour-button">Guía de uso</button><button id="plugins-button">Extensiones</button><button id="toolbar-toggle" class="toolbar-toggle" aria-controls="file-toolbar" aria-expanded="true" aria-label="Ocultar herramientas"><span class="collapse-icon" aria-hidden="true">▴</span><span class="control-label">Ocultar herramientas</span></button>
  </header>
  <nav id="file-toolbar" class="toolbar" aria-label="Archivo y edición">
    <div class="toolbar-group"><button id="new">Nuevo</button><button id="open">Abrir .mmd</button><input id="file" type="file" accept=".mmd" hidden><button id="save" class="primary">Guardar .mmd <kbd>Ctrl S</kbd></button></div>
    <div class="toolbar-group"><button id="undo" title="Deshacer">↶ <span>Deshacer</span></button><button id="redo" title="Rehacer">↷ <span>Rehacer</span></button></div>
    <div class="toolbar-group export-group"><button id="copy">Copiar Mermaid</button><button id="svg">SVG</button><button id="png">PNG</button><span id="plugin-actions"></span></div>
  </nav>
  <main id="workspace" class="workspace">
    <section class="code-pane" aria-label="Documento Mermaid">
      <div class="pane-heading"><div class="pane-tabs" role="tablist" aria-label="Vista del documento"><button id="tab-code" role="tab" aria-selected="true" aria-controls="editor">Código</button><button id="tab-cascade" role="tab" aria-selected="false" aria-controls="cascade" tabindex="-1">Cascada</button></div><span id="line-count">0 líneas</span></div>
      <div id="editor" role="tabpanel" aria-labelledby="tab-code"></div>
      <div id="cascade" role="tabpanel" aria-labelledby="tab-cascade" hidden><div class="cascade-search"><label for="cascade-search">Buscar nodos y subgrupos</label><input id="cascade-search" type="search" placeholder="Buscar por nombre o identificador" autocomplete="off"></div><div id="cascade-list" aria-label="Nodos y subgrupos"></div><div id="cascade-count" class="cascade-count"></div></div>
      <div class="code-footer"><span>Mermaid 11.17.2</span><span id="draft-status">Solo en memoria</span></div>
    </section>
    <div id="splitter" class="splitter" role="separator" tabindex="0" aria-label="Ancho del editor" aria-orientation="vertical" aria-valuemin="20" aria-valuemax="65" aria-valuenow="38"></div>
    <section class="preview-pane" aria-label="Vista previa del diagrama">
      <div class="visual-toolbar"><button id="add-node">+ Nodo</button><button id="add-edge">+ Conexión</button><button id="connect-nodes" aria-pressed="false">Conectar nodos</button><button id="manage-groups">Subgrupos</button><div class="layout-actions"><button id="fit-view" title="Encajar el diagrama sin cambiar las posiciones">Encajar</button><button id="relayout" title="Recuperar la distribución automática y encajar todo. Puedes deshacer.">Recolocar todo</button></div><label>Dirección <select id="direction" aria-label="Dirección del diagrama"><option value="TD">↓ vertical</option><option value="LR">→ horizontal</option><option value="BT">↑ vertical</option><option value="RL">← horizontal</option></select></label><span id="visual-mode">Edición visual</span><button id="diagram-fullscreen" class="fullscreen-toggle" aria-label="Pantalla completa" aria-pressed="false"><span aria-hidden="true">⛶</span> <span class="control-label">Pantalla completa</span></button></div>
      <div id="diagram-viewport" class="diagram-viewport" tabindex="0" aria-label="Lienzo. Rueda para zoom; arrastra el fondo para seleccionar. Espacio y arrastre o botón central para desplazarte."><div id="diagram-stage" class="diagram-stage"><div id="diagram"></div></div><div id="selection-box" hidden></div><div id="empty" class="empty" hidden>Escribe Mermaid o abre un archivo para empezar.</div><div id="drag-preview" aria-hidden="true" hidden><span id="drag-target"><span>Destino solicitado</span></span></div></div>
      <section id="inspector" class="inspector" aria-label="Información del elemento" hidden><header class="inspector-heading"><h2 id="inspector-title">Información</h2><button id="inspector-close" type="button" aria-label="Cerrar información" title="Cerrar información">×</button></header><div id="inspector-body"><div id="selection" class="selection-panel" hidden></div><div id="inspector-details"></div></div></section>
      <div id="error" class="error-panel" role="alert" hidden></div>
      <div id="visual-note" class="visual-note">Arrastra el fondo para seleccionar varios; espacio + arrastre mueve el lienzo. Mayús añade o quita elementos.</div>
    </section>
  </main>
  <footer class="statusbar"><span id="message" role="status" aria-live="polite">Todo se queda en este navegador.</span><a href="./LICENSE" target="_blank" rel="noopener" aria-label="Licencia GNU AGPL versión 3">Licencia</a><a href="./THIRD_PARTY_NOTICES.md" target="_blank" rel="noopener" aria-label="Licencias de terceros">Terceros</a><a href="https://github.com/cayetanobp/mermaid-bp" target="_blank" rel="noopener" aria-label="Código fuente de Mermaid BP">Fuente</a><span id="render-state" class="render-state" aria-live="polite">Preparando…</span></footer>
  <dialog id="confirm-dialog"><form method="dialog"><h2>Hay cambios sin descargar</h2><p>Guarda el archivo antes de sustituirlo si quieres conservar esta versión.</p><div class="dialog-actions"><button value="cancel">Cancelar</button><button value="save" class="primary">Guardar y continuar</button><button value="replace">Continuar sin descargar</button></div></form></dialog>
  <section id="node-dialog" class="inspector-editor" hidden><form id="node-form"><h2 id="node-title">Nuevo nodo</h2><label>Texto<textarea id="node-label" rows="3" required></textarea></label><label>Subgrupo<select id="node-group"></select></label><label>Forma<select id="node-shape"><option value="rect">Rectángulo</option><option value="round">Redondeado</option><option value="stadium">Terminal</option><option value="diamond">Rombo</option><option value="circle">Círculo</option></select></label><div class="dialog-actions"><button type="button" id="node-cancel">Cancelar</button><button class="primary" type="submit">Aplicar</button></div></form></section>
  <section id="groups-dialog" class="inspector-editor" hidden><form id="groups-form"><h2>Subgrupos</h2><label>Subgrupo<select id="groups-list"></select></label><button type="button" id="group-new">+ Nuevo subgrupo</button><label>Nombre<input id="group-name" required maxlength="200"></label><label>Dentro de<select id="group-parent"></select></label><p class="group-help">Eliminar un subgrupo conserva sus nodos y conexiones.</p><div class="dialog-actions"><button type="button" id="groups-close">Cerrar</button><button type="button" id="group-delete" class="danger">Eliminar subgrupo</button><button type="submit" class="primary">Guardar subgrupo</button></div></form></section>
  <section id="edge-dialog" class="inspector-editor" hidden><form id="edge-form"><h2 id="edge-title">Nueva conexión</h2><button type="button" id="edge-pick">Elegir nodos en el lienzo</button><div class="form-row"><label>Origen<select id="edge-from"></select></label><label>Destino<select id="edge-to"></select></label></div><label>Texto opcional<input id="edge-label"></label><label>Tipo<select id="edge-arrow"><option value="-->">Flecha</option><option value="---">Línea</option><option value="-.->">Flecha discontinua</option></select></label><div class="dialog-actions"><button type="button" id="edge-cancel">Cancelar</button><button class="primary" type="submit">Aplicar</button></div></form></section>
`;

setupAppMenus();
setupFullscreenTools();

for(const id of ['node-dialog','edge-dialog','groups-dialog'])$('inspector-body').append($(id));
document.querySelector('.code-pane')!.insertBefore($('inspector'),document.querySelector('.code-footer'));

let pluginHost:PluginHost|null=null;
// El documento y su historial viven únicamente durante esta sesión.
let lineEnding = '\n';
let keepView = false;
let savingPositions = false;
let filename = 'diagrama.mmd';
let savedSource = '';
let savedName = filename;
let generation = 0;
let renderTimer: ReturnType<typeof setTimeout>;
let current: Rendered | null = null;
let renderedSource = '';
let flow: Flow | null = null;
let valid = false;
let recoverableLayout = false;
let busy = false;
let selected: { node?: string; edge?: number } = {};
let selectedGroup:string|null=null;
type SelectionOrigin='diagram'|'cascade';
let selectionOrigin:SelectionOrigin='diagram';
let paneMode:'code'|'cascade'='code';
let inspectorMode:'node'|'edge'|'groups'|null=null;
let pendingSelection:{node?:string;group?:string;edge?:number;origin:SelectionOrigin}|null=null;
const selectedNodes = new Set<string>(), selectedEdges = new Set<number>();
let connectionPick: {from?:string;draft?:{label:string;arrow:string}}|null=null;
let pickPressed:string|null=null;
let view = { x: 0, y: 0, zoom: 1 };
let needsFit = true;
let pointerFrame = 0;
let editingNode: string | null = null;
let editingEdge: number | null = null;
const codeAppearance=new Compartment();
function codeAppearanceExtensions(){
  const preferences=getPreferences();
  return [preferences.lineNumbers?lineNumbers():[],preferences.highlightActiveLine?highlightActiveLine():[],preferences.lineWrapping?EditorView.lineWrapping:[]];
}
function editorExtensions(){return [
    codeAppearance.of(codeAppearanceExtensions()), history(), drawSelection(), bracketMatching(),
    keymap.of([...defaultKeymap, ...historyKeymap, { key: 'Mod-s', run: () => { saveFile(); return true; } }]),
    EditorView.contentAttributes.of({ 'aria-label': 'Código Mermaid', spellcheck: 'false' }),
    EditorView.updateListener.of(update => { if (update.docChanged) changed(); }),
  ];}
const editor = new EditorView({ state: EditorState.create({ doc: example, extensions: editorExtensions() }), parent: $('editor') });
const source = () => editor.state.doc.toString().replace(/\n/g, lineEnding);
const dirty = () => source() !== savedSource || filename !== savedName;
function message(text: string) { $('message').textContent = text; }
function persist() {
  pluginHost?.documentChanged();
  $('draft-status').textContent = 'Solo en memoria · guarda para conservar';
  $('filename').textContent = filename;
  $('dirty').hidden = !dirty();
  $('line-count').textContent = `${editor.state.doc.lines} líneas`;
}
function changed() {
  clearNodeLocation();
  if (savingPositions) { persist(); return; }
  cancelDragPreview();cancelConnectionPick(false);
  generation++; busy = false; valid = false; selected = {}; selectedGroup=null; selectedNodes.clear(); selectedEdges.clear();
  inspectorMode=null;$('inspector').hidden=true;hideInspectorForms();
  if (!keepView) lastNodeClick = null;
  updateControls(); persist();
  $('render-state').textContent = 'Actualizando…';
  clearTimeout(renderTimer); renderTimer = setTimeout(render, 350);
}
function setSource(text: string) {
  keepView = true;
  editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: text }, annotations: [Transaction.userEvent.of('input.visual'), isolateHistory.of('full')] });
}
function applyFlow(next: Flow) {
  let text=serializeFlow(next);
  const structureChanged=JSON.stringify(next.groups)!==JSON.stringify(flow?.groups)||next.nodes.some(n=>n.group!==flow?.nodes.find(old=>old.id===n.id)?.group);
  const edgesChanged=JSON.stringify(next.edges)!==JSON.stringify(flow?.edges);
  if(current&&valid&&(hasManualLayout(source())||structureChanged||edgesChanged)) {
    const positions=Object.fromEntries(next.nodes.filter(n=>current!.geometry.nodes[n.id]).map(n=>[n.id,current!.geometry.nodes[n.id]]));
    text=writePositions(text,positions);
    const boxes=readGroups(text),layout=sceneLayout();
    for(const group of next.groups ?? []) {
      const box=layout.groupBox(group.id);if(box&&!boxes[group.id])boxes[group.id]=box;
    }
    for(const id of Object.keys(boxes))if(!next.groups?.some(g=>g.id===id))delete boxes[id];
    if(Object.keys(boxes).length||text.includes('%% graph:groups '))text=writeGroups(text,boxes);
  }
  if(!pendingSelection) {
    if(selected.node&&next.nodes.some(n=>n.id===selected.node))pendingSelection={node:selected.node,origin:selectionOrigin};
    else if(selectedGroup&&next.groups?.some(g=>g.id===selectedGroup))pendingSelection={group:selectedGroup,origin:selectionOrigin};
  }
  setSource(text);
}
function updateControls() {
  const enabled = !!flow && valid && !busy;
  for (const id of ['add-node', 'add-edge', 'connect-nodes', 'manage-groups', 'direction']) ($<HTMLButtonElement>(id)).disabled = !enabled || (['add-edge','connect-nodes'].includes(id) && flow!.nodes.length === 0);
  $<HTMLButtonElement>('relayout').disabled = !(!!flow && !busy && (valid || recoverableLayout));
  for (const id of ['svg', 'png']) $<HTMLButtonElement>(id).disabled = !valid || !current || busy;
  $<HTMLButtonElement>('fit-view').disabled=!current||!valid||busy;
  $('selection').hidden = true;
  $('diagram').classList.toggle('visual-enabled', enabled);
  for(const button of $('cascade-list').querySelectorAll<HTMLButtonElement>('button'))button.disabled=!enabled;
  $('cascade-list').setAttribute('aria-busy',String(!enabled));
  if ((selectedGroup || selectedNodes.size || selectedEdges.size) && enabled) showSelection();
}
async function render() {
  const token = generation, text = source();
  recoverableLayout = false;
  try{assertSourceSafe(text);}catch(error){valid=false;flow=null;$('error').hidden=false;$('error').textContent=(error as Error).message;$('render-state').textContent='No se puede renderizar';updateControls();return;}
  const previousBox=$('diagram').querySelector('svg')?.viewBox.baseVal;
  const previousOrigin=previousBox?{x:previousBox.x,y:previousBox.y}:null;
  const preserveCamera=keepView&&hasManualLayout(text);
  const parsed = parseFlow(text);
  flow = parsed.ok ? parsed.flow : null;
  if (flow) $<HTMLSelectElement>('direction').value = flow.direction === 'TB' ? 'TD' : flow.direction;
  $('visual-mode').textContent = parsed.ok ? 'Edición visual' : 'Edición por código';
  $('visual-note').dataset.note=parsed.ok?'help':'notice';
  $('visual-note').textContent = parsed.ok ? 'Arrastra el fondo para seleccionar varios; espacio + arrastre mueve el lienzo. Mayús añade o quita elementos.' : `${parsed.reason} El código se conserva íntegro.`;
  if (!text.trim()) {
    $('empty').hidden = false; $('diagram').innerHTML = ''; current = null; valid = false;
    $('error').hidden = true; $('render-state').textContent = 'Sin diagrama'; renderCascade();updateControls(); return;
  }
  try {
    const result = await renderDiagram(text, flow ?? undefined);
    if (token !== generation) return;
    current = result; renderedSource = text; valid = true;
    $('diagram').innerHTML = result.svg; $('empty').hidden = true; $('error').hidden = true;
    if(flow&&hasManualLayout(text)) {
      const layout=sceneLayout();layout.apply(current.geometry.nodes);layout.bounds();current.svg=layout.root.outerHTML;
    }
    decorate();
    if(preserveCamera&&previousOrigin&&!needsFit){
      const box=$('diagram').querySelector('svg')!.viewBox.baseVal;
      view.x+=(box.x-previousOrigin.x)*view.zoom;view.y+=(box.y-previousOrigin.y)*view.zoom;
    }
    sizeDiagram();
    if (needsFit) { fit(); needsFit = false; } else transform();
    keepView = false;
    renderCascade();
    if(pendingSelection) {
      const pending=pendingSelection;pendingSelection=null;selectionOrigin=pending.origin;
      if(pending.node&&flow?.nodes.some(n=>n.id===pending.node))selectedNodes.add(pending.node);
      else if(pending.group&&flow?.groups?.some(g=>g.id===pending.group))selectedGroup=pending.group;
      else if(pending.edge!==undefined&&flow?.edges[pending.edge])selectedEdges.add(pending.edge);
      markSelection();
    }
    updateControls(); $('render-state').textContent = 'Actualizado';
  } catch (error) {
    if (token !== generation) return;
    recoverableLayout = !!flow && hasManualLayout(text) && error instanceof Error && error.message === 'El diagrama supera los límites de complejidad o tamaño.';
    valid = false; $('error').hidden = false;
    $('error').textContent = `Revisa el código. ${error instanceof Error ? error.message : String(error)}`;
    $('render-state').textContent = current ? 'Vista anterior · código con errores' : 'Código con errores';
    renderCascade();updateControls();
  }
}
function decorate(model: Flow | null = flow) {
  if (!model) return;
  for (const node of $('diagram').querySelectorAll<SVGGElement>('g.node')) {
    const nodeModel = model.nodes.find(n => mermaidSourceId(node).startsWith(`flowchart-${n.id}-`));
    if (nodeModel) { node.dataset.nodeId = nodeModel.id; node.classList.add('editable-node'); }
  }
  const pathMap = edgePathMap(model);
  const usedLabels=new Set<SVGGElement>();
  $('diagram').querySelectorAll<SVGPathElement>('.edgePaths path.flowchart-link').forEach(path => {
    const index = pathMap.get(mermaidSourceId(path));
    if (index !== undefined) {
      path.dataset.edgeIndex = String(index);
      const hit=path.cloneNode(false) as SVGPathElement;
      hit.removeAttribute('id'); hit.removeAttribute('marker-start'); hit.removeAttribute('marker-end');
      hit.setAttribute('class','edge-hit'); delete hit.dataset.edgeIndex; hit.dataset.hitEdge=String(index); hit.dataset.hitFor=path.id;
      hit.style.setProperty('stroke','transparent','important'); hit.style.setProperty('fill','none','important');
      hit.style.setProperty('stroke-width','16px','important'); hit.style.setProperty('pointer-events','stroke','important');
      hit.setAttribute('vector-effect','non-scaling-stroke'); path.before(hit);
      const labels=[...$('diagram').querySelectorAll<SVGGElement>('.edgeLabels > g.edgeLabel')];
      const label=labels.find(g=>g.querySelector('[data-id]')?.getAttribute('data-id')===path.id) ?? (model.edges[index].label ? labels.find(g=>!usedLabels.has(g)&&sameEdgeLabel(g.textContent,model.edges[index].label)) : undefined);
      if(label) usedLabels.add(label);
      if(label) label.dataset.edgeLabel=String(index);
    }
  });
}
function transform() { $('diagram-stage').style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`; }
function sizeDiagram() {
  if (!current) return;
  const svg = $('diagram').querySelector('svg');
  if (svg) { svg.style.maxWidth = 'none'; svg.setAttribute('width', String(current.geometry.width)); svg.setAttribute('height', String(current.geometry.height)); }
}
function fit() {
  if (!current) return;
  const viewport = $('diagram-viewport');
  view.zoom = Math.min(1.4, Math.max(0.000001, Math.min((viewport.clientWidth - 70) / current.geometry.width, (viewport.clientHeight - 70) / current.geometry.height)));
  view.x = (viewport.clientWidth - current.geometry.width * view.zoom) / 2;
  view.y = (viewport.clientHeight - current.geometry.height * view.zoom) / 2;
  sizeDiagram(); transform();
}
function zoom(factor: number, x?: number, y?: number) {
  const box = $('diagram-viewport').getBoundingClientRect();
  const cx = x ?? box.width / 2, cy = y ?? box.height / 2;
  const previous = view.zoom; view.zoom = Math.min(5, Math.max(0.05, previous * factor));
  view.x = cx - (cx - view.x) * view.zoom / previous; view.y = cy - (cy - view.y) * view.zoom / previous;
  transform();
}
function syncSelected() {
  selected = selectedNodes.size===1 && !selectedEdges.size ? {node:[...selectedNodes][0]} :
    selectedEdges.size===1 && !selectedNodes.size ? {edge:[...selectedEdges][0]} : {};
}
let activeLayout:{root:SVGSVGElement;layout:ManualLayout}|null=null;
function sceneLayout() {
  const root=$('diagram').querySelector('svg')!;
  // Los tiradores y la curva comparten la misma referencia durante toda la vida del SVG.
  if(activeLayout?.root!==root)activeLayout={root,layout:new ManualLayout(root,flow!,current!.geometry,readConnections(source()),readGroups(source()))};
  return activeLayout.layout;
}
let lastInspectorSelection='';
function hideInspectorForms() {
  for(const id of ['node-dialog','edge-dialog','groups-dialog'])$(id).hidden=true;
}
function showInspectorForm(kind:'node'|'edge'|'groups') {
  inspectorMode=kind;lastInspectorSelection='';hideInspectorForms();
  $('inspector').hidden=false;$('selection').hidden=true;$('inspector-details').hidden=true;
  $(kind+'-dialog').hidden=false;
  $('inspector-title').textContent=kind==='node'?$('node-title').textContent:kind==='edge'?$('edge-title').textContent:'Gestionar subgrupos';
  $('inspector-body').scrollTop=0;
}
function closeInspectorForm(restore=true) {
  inspectorMode=null;lastInspectorSelection='';hideInspectorForms();
  if(restore&&(selectedGroup||selectedNodes.size||selectedEdges.size))showSelection();
  else $('inspector').hidden=true;
}
$('inspector-close').onclick=()=>{
  inspectorMode=null;hideInspectorForms();selectedGroup=null;selectedNodes.clear();selectedEdges.clear();markSelection();
};
function setPaneMode(mode:'code'|'cascade',focus=false) {
  paneMode=mode;
  $('editor').hidden=mode!=='code';$('cascade').hidden=mode!=='cascade';
  for(const name of ['code','cascade'] as const) {
    const tab=$('tab-'+name);tab.setAttribute('aria-selected',String(name===mode));tab.tabIndex=name===mode?0:-1;
  }
  $('line-count').hidden=mode==='cascade';
  try{localStorage.setItem('mermaid-bp:pane-mode',mode);}catch{/* Preferencia solo en memoria. */}
  if(mode==='code')editor.requestMeasure();
  if(focus)$('tab-'+mode).focus();
}
$('tab-code').onclick=()=>setPaneMode('code');
$('tab-cascade').onclick=()=>setPaneMode('cascade');
for(const name of ['code','cascade'] as const)$('tab-'+name).onkeydown=event=>{
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  event.preventDefault();setPaneMode(event.key==='Home'?'code':event.key==='End'?'cascade':paneMode==='code'?'cascade':'code',true);
};
function groupName(path?:string):string {
  if(!path)return 'Sin subgrupo';
  return path.split('/').map(id=>flow?.groups?.find(g=>g.id===id)?.label ?? id).join(' / ');
}
function syncCascadeSelection() {
  for(const button of $('cascade-list').querySelectorAll<HTMLButtonElement>('button')) {
    const active=button.dataset.cascadeNode?selectedNodes.has(button.dataset.cascadeNode):button.dataset.cascadeGroup===selectedGroup;
    button.setAttribute('aria-pressed',String(active));
  }
}
function selectEntity(kind:'node'|'group',id:string,origin:SelectionOrigin) {
  if(!flow||!valid||busy)return;
  if(connectionPick&&kind==='node'){pickConnectionNode(id);return;}
  cancelDragPreview();inspectorMode=null;selectionOrigin=origin;
  selectedNodes.clear();selectedEdges.clear();selectedGroup=kind==='group'?id:null;
  if(kind==='node')selectedNodes.add(id);
  markSelection();
  if(origin==='cascade') {
    setPaneMode('cascade');
    let row=[...$('cascade-list').querySelectorAll<HTMLButtonElement>('button')].find(b=>(kind==='node'?b.dataset.cascadeNode:b.dataset.cascadeGroup)===id);
    if(!row){$<HTMLInputElement>('cascade-search').value='';renderCascade();row=[...$('cascade-list').querySelectorAll<HTMLButtonElement>('button')].find(b=>(kind==='node'?b.dataset.cascadeNode:b.dataset.cascadeGroup)===id);}
    row?.scrollIntoView({block:'nearest'});row?.focus({preventScroll:true});
  }
}
function renderCascade() {
  const list=$('cascade-list');list.replaceChildren();
  if(!flow) {
    const empty=document.createElement('p');empty.className='cascade-empty';
    empty.textContent='La cascada está disponible para diagramas flowchart y graph. Puedes editar este documento en Código.';list.append(empty);
    $('cascade-count').textContent='Sin edición visual';return;
  }
  const query=$<HTMLInputElement>('cascade-search').value.trim().toLocaleLowerCase();
  const groups=(flow.groups ?? []).filter(g=>(g.id+' '+groupName(groupPath(flow!,g.id))).toLocaleLowerCase().includes(query));
  const nodes=flow.nodes.filter(n=>(n.id+' '+n.label+' '+groupName(n.group)).toLocaleLowerCase().includes(query));
  const section=(title:string,count:number)=>{
    const heading=document.createElement('h2');heading.className='cascade-section-title';heading.textContent=title;
    const badge=document.createElement('span');badge.textContent=String(count);heading.append(badge);list.append(heading);
  };
  const row=(kind:'node'|'group',id:string,title:string,subtitle:string)=>{
    const button=document.createElement('button');button.type='button';button.className='cascade-row '+(kind==='group'?'cascade-group':'');
    if(kind==='node')button.dataset.cascadeNode=id;else button.dataset.cascadeGroup=id;
    const icon=document.createElement('span');icon.className='cascade-icon';icon.textContent=kind==='group'?'▤':'◇';icon.setAttribute('aria-hidden','true');
    const text=document.createElement('span');text.className='cascade-row-text';
    const name=document.createElement('span');name.className='cascade-row-title';name.textContent=title;
    const meta=document.createElement('span');meta.className='cascade-row-meta';meta.textContent=subtitle;
    text.append(name,meta);button.append(icon,text);button.disabled=!valid||busy;button.onclick=()=>selectEntity(kind,id,'cascade');list.append(button);
  };
  if(groups.length) {
    section('Subgrupos',groups.length);
    for(const group of groups) {
      const count=flow.nodes.filter(n=>n.group?.split('/').includes(group.id)).length;
      row('group',group.id,group.label,(group.parent?groupName(groupPath(flow,group.parent))+' · ':'')+count+(count===1?' nodo':' nodos'));
    }
  }
  section('Nodos',nodes.length);
  for(const node of nodes)row('node',node.id,node.label,node.id+' · '+groupName(node.group));
  if(!nodes.length&&!groups.length){const empty=document.createElement('p');empty.className='cascade-empty';empty.textContent=query?'No hay resultados para esta búsqueda.':'Añade un nodo para empezar.';list.append(empty);}
  $('cascade-count').textContent=nodes.length+' de '+flow.nodes.length+' nodos';
  syncCascadeSelection();
}
$('cascade-search').oninput=renderCascade;
function renderSelectionDetails() {
  const details=$('inspector-details');details.replaceChildren();
  if(!flow)return;
  const heading=(parent:HTMLElement,text:string)=>{
    const h=document.createElement('h3');h.textContent=text;parent.append(h);return h;
  };
  const paragraph=(parent:HTMLElement,text:string,className='')=>{
    const p=document.createElement('p');p.textContent=text;p.className=className;parent.append(p);return p;
  };
  const section=(title:string)=>{
    const box=document.createElement('section');box.className='info-section';heading(box,title);details.append(box);return box;
  };
  const nodeLink=(parent:HTMLElement,id:string,meta:string,attribute:'relatedNode'|'memberNode')=>{
    const node=flow!.nodes.find(n=>n.id===id);if(!node)return;
    const button=document.createElement('button');button.type='button';button.className='info-link';button.dataset[attribute]=id;
    const label=document.createElement('span');label.textContent=node.label;
    const small=document.createElement('small');small.textContent=meta;button.append(label,small);
    button.onclick=()=>selectEntity('node',id,selectionOrigin);parent.append(button);
  };
  const groupLink=(parent:HTMLElement,id:string)=>{
    const button=document.createElement('button');button.type='button';button.className='info-link group-link';button.dataset.infoGroup=id;
    button.textContent=groupName(groupPath(flow!,id));button.onclick=()=>selectEntity('group',id,selectionOrigin);parent.append(button);
  };
  if(selectedGroup) {
    const group=flow.groups?.find(g=>g.id===selectedGroup);if(!group)return;
    const summary=section('Subgrupo');paragraph(summary,group.label,'info-title');paragraph(summary,group.id,'info-id');
    if(group.parent){heading(summary,'Dentro de');groupLink(summary,group.parent);}
    const children=flow.groups?.filter(g=>g.parent===group.id) ?? [];
    if(children.length){heading(summary,'Subgrupos');for(const child of children)groupLink(summary,child.id);}
    const members=flow.nodes.filter(n=>n.group?.split('/').includes(group.id));
    const content=section('Nodos del subgrupo · '+members.length);
    if(!members.length)paragraph(content,'Este subgrupo todavía no contiene nodos.','info-empty');
    for(const node of members)nodeLink(content,node.id,node.group?.split('/').at(-1)===group.id?node.id:groupName(node.group),'memberNode');
    return;
  }
  const node=flow.nodes.find(n=>n.id===selected.node);
  if(node) {
    const summary=section('Nodo');paragraph(summary,node.label,'info-title');paragraph(summary,node.id,'info-id');
    heading(summary,'Subgrupo');
    const group=node.group?.split('/').at(-1);if(group)groupLink(summary,group);else paragraph(summary,'Sin subgrupo','info-empty');
    const names:Record<Shape,string>={rect:'Rectángulo',round:'Redondeado',stadium:'Terminal',diamond:'Rombo',circle:'Círculo'};
    heading(summary,'Forma');paragraph(summary,names[node.shape]);
    if(selectionOrigin==='cascade') {
      const relations=flow.edges.filter(e=>e.from===node.id||e.to===node.id);
      const box=section('Relaciones · '+relations.length);box.dataset.relationships='';
      if(!relations.length)paragraph(box,'Este nodo no tiene conexiones.','info-empty');
      for(const edge of relations) {
        const target=edge.from===node.id?edge.to:edge.from;
        const direction=edge.from===edge.to?'Bucle':edge.arrow==='---'?'Relación':edge.from===node.id?'Salida':'Entrada';
        nodeLink(box,target,direction+(edge.label?' · '+edge.label:''),'relatedNode');
      }
    }
    return;
  }
  if(selected.edge!==undefined) {
    const edge=flow.edges[selected.edge],box=section('Conexión');paragraph(box,edge.label||'Sin etiqueta','info-title');
    heading(box,'Origen');paragraph(box,flow.nodes.find(n=>n.id===edge.from)?.label ?? edge.from);
    heading(box,'Destino');paragraph(box,flow.nodes.find(n=>n.id===edge.to)?.label ?? edge.to);
    paragraph(box,'Arrastra los extremos para cambiar los anclajes y los puntos azules para ajustar la curvatura.','info-empty');
  } else {
    const box=section('Selección');paragraph(box,selectedNodes.size+' nodos y '+selectedEdges.size+' conexiones. Puedes moverlos juntos o eliminarlos.','info-empty');
  }
}

function showSelection() {
  const signature=JSON.stringify([generation,selectedGroup,[...selectedNodes],[...selectedEdges],selectionOrigin]);
  if(signature===lastInspectorSelection&&!inspectorMode&&!$('inspector').hidden){$('selection').hidden=false;return;}
  lastInspectorSelection=signature;
  inspectorMode=null;hideInspectorForms();$('inspector').hidden=false;$('inspector-details').hidden=false;
  const panel=$('selection'); panel.replaceChildren(); panel.hidden=false;
  renderSelectionDetails();syncCascadeSelection();
  if(selectedGroup) {
    $('inspector-title').textContent='Subgrupo';
    const id=selectedGroup,label=document.createElement('span');
    const group=[...$('diagram').querySelectorAll('g.cluster')].find(g=>mermaidSourceId(g)===id);
    label.textContent='Fondo · '+(group?.querySelector('.cluster-label')?.textContent ?? id);
    panel.append(label);
    const fit=document.createElement('button');fit.textContent='Ajustar al contenido';
    fit.onclick=()=>{const layout=sceneLayout();layout.fitGroup(id);commitScene(layout);};panel.append(fit);
    const manage=document.createElement('button');manage.textContent='Gestionar subgrupo';manage.onclick=()=>openGroups(id);panel.append(manage);
    const note=document.createElement('span');note.textContent='Arrastra el fondo o sus esquinas. Los nodos quedan en su sitio.';panel.append(note);
    return;
  }
  $('inspector-title').textContent=selected.node?'Nodo':selected.edge!==undefined?'Conexión':'Selección múltiple';
  const label=document.createElement('span'), node=flow?.nodes.find(n=>n.id===selected.node);
  label.textContent=node ? node.id : selected.edge!==undefined ? 'Conexión seleccionada' : `${selectedNodes.size} nodos · ${selectedEdges.size} conexiones`;
  panel.append(label);
  if(node){const go=document.createElement('button');go.id='locate-node';go.dataset.goNode='';go.textContent='Ir a';go.onclick=()=>locateNode(node.id,view,transform);panel.append(go);}
  if(node || selected.edge!==undefined) {
    const edit=document.createElement('button');edit.textContent='Editar';edit.onclick=()=>node?openNode(node.id):openEdge(selected.edge);panel.append(edit);
  }
  if(selected.edge!==undefined) {
    const hint=document.createElement('span');hint.textContent='Arrastra los extremos para mover el anclaje y los tiradores azules para ajustar la curva.';panel.append(hint);
    const reset=document.createElement('button');reset.textContent='Restablecer conexión';
    reset.onclick=()=>{const layout=sceneLayout();layout.apply({...current!.geometry.nodes});layout.resetConnection(selected.edge!);commitScene(layout);};
    panel.append(reset);
  }
  const remove=document.createElement('button');remove.textContent='Eliminar';remove.className='danger';remove.onclick=deleteSelection;panel.append(remove);
}
function paintPortHandles(layout:ManualLayout|null=null) {
  $('diagram').querySelectorAll('.port-handle,.bend-handle,.port-guide').forEach(el=>el.remove());
  paintGroupHandles(layout);
  if(selected.edge===undefined||!flow||!current)return;
  layout ??= sceneLayout();
  const curve=layout.curve(selected.edge);if(!curve)return;
  const ns='http://www.w3.org/2000/svg',placed:Point[]=[],spacing=20/view.zoom;
  const guide=(a:Point,b:Point)=>{
    const line=document.createElementNS(ns,'line');line.classList.add('port-guide');
    for(const[key,value]of Object.entries({x1:a.x,y1:a.y,x2:b.x,y2:b.y}))line.setAttribute(key,String(value));
    line.style.setProperty('stroke','#7596b5','important');line.style.setProperty('stroke-width',String(1/view.zoom),'important');line.style.strokeDasharray=`${4/view.zoom} ${3/view.zoom}`;line.style.pointerEvents='none';layout!.root.append(line);
  };
  // Separar los controles en pantalla sin cambiar los extremos ni la curva guardada.
  for(const kind of ['port','bend'] as const)for(const end of ['from','to'] as const) {
    const point=end==='from'?curve.start:curve.end,bend=end==='from'?curve.c1:curve.c2,actual=kind==='port'?point:bend;
    let position={...actual};
    const free=(p:Point)=>placed.every(q=>Math.hypot(p.x-q.x,p.y-q.y)>=spacing);
    if(!free(position)){
      const angle=Math.atan2(bend.y-point.y,bend.x-point.x);
      search:for(let ring=1;ring<=8;ring++)for(let step=0;step<16;step++){
        const direction=angle+step*Math.PI/8,candidate={x:actual.x+Math.cos(direction)*spacing*ring,y:actual.y+Math.sin(direction)*spacing*ring};
        if(free(candidate)){position=candidate;break search;}
      }
    }
    placed.push(position);if(kind==='bend')guide(point,position);else if(position.x!==actual.x||position.y!==actual.y)guide(actual,position);
    const handle=document.createElementNS(ns,'circle');handle.classList.add(kind==='port'?'port-handle':'bend-handle');
    if(kind==='port'){handle.dataset.portEdge=String(selected.edge);handle.dataset.portEnd=end;}
    else{handle.dataset.bendEdge=String(selected.edge);handle.dataset.bendEnd=end;}
    handle.dataset.handleOffsetX=String(position.x-actual.x);handle.dataset.handleOffsetY=String(position.y-actual.y);
    handle.setAttribute('cx',String(position.x));handle.setAttribute('cy',String(position.y));handle.setAttribute('r',String((kind==='port'?6:5)/view.zoom));
    handle.style.setProperty('fill',kind==='port'?'#fff':'#d8e9ff','important');handle.style.setProperty('stroke',kind==='port'?'#245d4b':'#3266a8','important');
    handle.style.setProperty('stroke-width',String(2/view.zoom),'important');handle.style.cursor=kind==='port'?'crosshair':'move';
    const title=document.createElementNS(ns,'title');title.textContent=kind==='bend'?(end==='from'?'Curvatura junto al origen':'Curvatura junto al destino'):(end==='from'?'Recorre el contorno del nodo de origen':'Recorre el contorno del nodo de destino');handle.append(title);layout.root.append(handle);
  }
}
function paintGroupHandles(layout:ManualLayout|null=null) {
  $('diagram').querySelectorAll('.group-handle,.group-selection').forEach(el=>el.remove());
  if(!selectedGroup||!current||!flow)return;
  layout ??= sceneLayout();
  const box=layout.groupBox(selectedGroup);if(!box)return;
  const ns='http://www.w3.org/2000/svg',outline=document.createElementNS(ns,'rect');
  outline.classList.add('group-selection');
  for(const[k,v]of Object.entries(box))outline.setAttribute(k,String(v));
  outline.style.cssText='fill:none!important;stroke:#3266a8!important;pointer-events:none';
  outline.setAttribute('stroke-width',String(1.5/view.zoom));layout.root.append(outline);
  for(const corner of ['nw','ne','sw','se']) {
    const handle=document.createElementNS(ns,'rect'),size=10/view.zoom;
    handle.classList.add('group-handle');handle.dataset.groupResize=corner;
    const x=box.x+(corner.includes('e')?box.width:0),y=box.y+(corner.includes('s')?box.height:0);
    for(const[k,v]of Object.entries({x:x-size/2,y:y-size/2,width:size,height:size}))handle.setAttribute(k,String(v));
    handle.style.cssText='fill:white!important;stroke:#3266a8!important;pointer-events:all';
    handle.setAttribute('stroke-width',String(2/view.zoom));handle.style.cursor=corner+'-resize';layout.root.append(handle);
  }
}
function markSelection() {
  syncSelected();clearNodeLocation();
  $('diagram').querySelectorAll('.selection-ring').forEach(el=>el.remove());
  $('diagram').querySelectorAll('.selected-edge').forEach(el=>el.classList.remove('selected-edge'));
  for(const group of $('diagram').querySelectorAll<SVGGElement>('[data-node-id]')) {
    if(!selectedNodes.has(group.dataset.nodeId!))continue;
    const b=group.getBBox(), ring=document.createElementNS('http://www.w3.org/2000/svg','rect');
    ring.setAttribute('x',String(b.x-5));ring.setAttribute('y',String(b.y-5));ring.setAttribute('width',String(b.width+10));ring.setAttribute('height',String(b.height+10));
    ring.setAttribute('rx','6');ring.classList.add('selection-ring');ring.style.setProperty('fill','none','important');group.append(ring);
  }
  for(const path of $('diagram').querySelectorAll<SVGElement>('[data-edge-index]')) {
    if(!path.classList.contains('edge-hit')&&selectedEdges.has(Number(path.dataset.edgeIndex)))path.classList.add('selected-edge');
  }
  paintPortHandles();
  if(selectedGroup||selectedNodes.size||selectedEdges.size)showSelection();else { $('selection').hidden=true;if(!inspectorMode)$('inspector').hidden=true; }
  syncCascadeSelection();
  if(selectionOrigin==='cascade'&&selected.node)highlightNode(selected.node,view.zoom);
}
function deleteSelection() {
  if(!flow||!valid||busy)return;
  const next=structuredClone(flow);
  next.edges=next.edges.filter((_,i)=>!selectedEdges.has(i));
  for(const id of selectedNodes)removeNode(next,id);
  if(!selectedNodes.size&&!selectedEdges.size)return;
  selectedNodes.clear();selectedEdges.clear();selected={};applyFlow(next);
}
function fillGroupOptions(select:HTMLSelectElement,value='',exclude='') {
  select.replaceChildren(new Option('Sin subgrupo',''));
  for(const group of flow?.groups ?? []) {
    if(exclude&&groupPath(flow!,group.id).split('/').includes(exclude))continue;
    select.add(new Option(groupPath(flow!,group.id).split('/').map(id=>flow!.groups!.find(g=>g.id===id)!.label).join(' / '),group.id));
  }
  select.value=value;
}
let editingGroup:string|null=null;
function groupEditor(id:string|null) {
  editingGroup=id;
  const group=flow?.groups?.find(g=>g.id===id);
  $<HTMLInputElement>('group-name').value=group?.label ?? '';
  fillGroupOptions($<HTMLSelectElement>('group-parent'),group?.parent ?? '',id ?? '');
  $<HTMLButtonElement>('group-delete').disabled=!group;
  $<HTMLSelectElement>('groups-list').value=id ?? '';
}
function openGroups(id?:string) {
  if(!flow||!valid||busy)return;
  const list=$<HTMLSelectElement>('groups-list');list.replaceChildren(new Option('Nuevo subgrupo',''));
  for(const group of flow.groups ?? [])list.add(new Option(group.label,group.id));
  groupEditor(id ?? flow.groups?.[0]?.id ?? null);
  showInspectorForm('groups');
}
$('manage-groups').onclick=()=>openGroups();
$('groups-list').onchange=()=>groupEditor($<HTMLSelectElement>('groups-list').value||null);
$('group-new').onclick=()=>{groupEditor(null);$<HTMLInputElement>('group-name').focus();};
$('groups-close').onclick=()=>closeInspectorForm();
$('groups-form').onsubmit=event=>{
  event.preventDefault();if(!flow||!valid||busy)return;
  const next=structuredClone(flow),label=$<HTMLInputElement>('group-name').value.trim();if(!label)return;
  let id=editingGroup;
  if(!id){let i=1;while(next.nodes.some(n=>n.id==='G'+i)||next.groups?.some(g=>g.id==='G'+i))i++;id='G'+i;}
  saveGroup(next,{id,label,parent:$<HTMLSelectElement>('group-parent').value||undefined});
  pendingSelection={group:id,origin:selectionOrigin};closeInspectorForm(false);applyFlow(next);
};
$('group-delete').onclick=()=>{
  if(!flow||!valid||busy||!editingGroup)return;
  const next=structuredClone(flow);deleteGroup(next,editingGroup);
  closeInspectorForm(false);applyFlow(next);
};

function openNode(id?: string) {
  if (!flow || !valid || busy) return;
  editingNode = id ?? null;
  const node = flow.nodes.find(n => n.id === id);
  $('node-title').textContent = node ? 'Editar nodo' : 'Nuevo nodo';
  $<HTMLTextAreaElement>('node-label').value = node?.label ?? '';
  $<HTMLSelectElement>('node-shape').value = node?.shape ?? 'rect';
  fillGroupOptions($<HTMLSelectElement>('node-group'),node?.group?.split('/').at(-1) ?? '');
  showInspectorForm('node');$<HTMLTextAreaElement>('node-label').focus();
}
function openEdge(index?: number, pair?: {from:string;to:string}) {
  if (!flow || !valid || busy) return;
  editingEdge = index ?? null;
  const edge = index === undefined ? undefined : flow.edges[index];
  $('edge-title').textContent = edge ? 'Editar conexión' : 'Nueva conexión';
  $('edge-pick').hidden=!!edge;
  for (const id of ['edge-from', 'edge-to']) {
    const select = $<HTMLSelectElement>(id); select.replaceChildren();
    for (const node of flow.nodes) select.add(new Option(`${node.id} · ${node.label}`, node.id));
  }
  $<HTMLSelectElement>('edge-from').value = edge?.from ?? pair?.from ?? selected.node ?? flow.nodes[0].id;
  $<HTMLSelectElement>('edge-to').value = edge?.to ?? pair?.to ?? flow.nodes[Math.min(1, flow.nodes.length - 1)].id;
  $<HTMLInputElement>('edge-label').value = edge?.label ?? '';
  const arrowSelect = $<HTMLSelectElement>('edge-arrow');
  arrowSelect.querySelector('[data-extra]')?.remove();
  if (edge && !['-->', '---', '-.->'].includes(edge.arrow)) { const option = new Option('Flecha con separación', edge.arrow); option.dataset.extra = 'true'; arrowSelect.add(option); }
  arrowSelect.value = edge?.arrow ?? '-->';
  showInspectorForm('edge');
}
function cancelConnectionPick(notify=true) {
  if(!connectionPick)return;
  connectionPick=null;pickPressed=null;$('connect-nodes').setAttribute('aria-pressed','false');$('diagram').classList.remove('connecting-mode');
  if(notify)message('Creación de conexión cancelada.');
}
function beginConnectionPick(draft?:{label:string;arrow:string}) {
  if(!flow||!valid||busy||!flow.nodes.length)return;
  cancelDragPreview();connectionPick={draft};pickPressed=null;
  closeInspectorForm(false);
  selectedGroup=null;selectedNodes.clear();selectedEdges.clear();markSelection();
  $('connect-nodes').setAttribute('aria-pressed','true');$('diagram').classList.add('connecting-mode');
  message('Pulsa el nodo de origen. Después pulsa el nodo de destino. Escape cancela.');
}
function pickConnectionNode(id:string) {
  if(!connectionPick)return;
  if(!connectionPick.from) {
    connectionPick.from=id;selectedNodes.clear();selectedNodes.add(id);selectedEdges.clear();markSelection();
    message('Origen elegido. Pulsa el nodo de destino.');return;
  }
  const pair={from:connectionPick.from,to:id},draft=connectionPick.draft;
  cancelConnectionPick(false);lastNodeClick=null;openEdge(undefined,pair);
  if(draft){$<HTMLInputElement>('edge-label').value=draft.label;$<HTMLSelectElement>('edge-arrow').value=draft.arrow;}
}
$('connect-nodes').onclick=()=>connectionPick?cancelConnectionPick():beginConnectionPick();
$('edge-pick').onclick=()=>beginConnectionPick({label:$<HTMLInputElement>('edge-label').value,arrow:$<HTMLSelectElement>('edge-arrow').value});
$('node-form').onsubmit = event => {
  event.preventDefault(); if (!flow || !valid || busy) return;
  const next = structuredClone(flow), label = $<HTMLTextAreaElement>('node-label').value, shape = $<HTMLSelectElement>('node-shape').value as Shape;
  const node = next.nodes.find(n => n.id === editingNode);
  const id=node?.id ?? nextId(next);
  if (node) { node.label = label; node.shape = shape; } else next.nodes.push({ id, label, shape });
  assignGroup(next,id,$<HTMLSelectElement>('node-group').value);
  pendingSelection={node:id,origin:selectionOrigin};closeInspectorForm(false);applyFlow(next);
};
$('edge-form').onsubmit = event => {
  event.preventDefault(); if (!flow || !valid || busy) return;
  const next = structuredClone(flow), edge = { from: $<HTMLSelectElement>('edge-from').value, to: $<HTMLSelectElement>('edge-to').value, label: $<HTMLInputElement>('edge-label').value, arrow: $<HTMLSelectElement>('edge-arrow').value };
  if (editingEdge === null) next.edges.push(edge); else next.edges[editingEdge] = { ...next.edges[editingEdge], ...edge };
  pendingSelection={edge:editingEdge ?? next.edges.length-1,origin:selectionOrigin};closeInspectorForm(false);applyFlow(next);
};
$('node-cancel').onclick = () => closeInspectorForm();
$('edge-cancel').onclick = () => closeInspectorForm();

function saveFile() {
  download(new Blob([source()], { type: 'text/plain;charset=utf-8' }), filename);
  savedSource = source(); savedName = filename; persist(); message('Archivo .mmd descargado.');
}
async function mayReplace(): Promise<boolean> {
  if (!dirty()) return true;
  const dialog = $<HTMLDialogElement>('confirm-dialog');
  dialog.returnValue = 'cancel'; dialog.showModal();
  const result = await new Promise<string>(resolve => dialog.addEventListener('close', () => resolve(dialog.returnValue), { once: true }));
  if (result === 'save') { saveFile(); return true; }
  return result === 'replace';
}
async function loadFile(file: File) {
  let text:string;
  try{text=await readMmdFile(file);await validateMermaid(text);}catch(error){message((error as Error).message);return;}
  if (!(await mayReplace())) return;
  filename = file.name.replace(/\.(?:mmd|mermaid)$/i, '') + '.mmd'; savedSource = text; savedName = filename;
  replaceDocument(text); message(`Abierto ${filename}.`);
}
function replaceDocument(text: string) {
  needsFit = true;
  lineEnding = text.includes('\r\n') ? '\r\n' : '\n';
  keepView = false;
  editor.setState(EditorState.create({ doc: text, extensions: editorExtensions() }));
  changed();
}
$('save').onclick = saveFile;
$('new').onclick = async () => {
  if (!(await mayReplace())) return;
  filename = 'diagrama.mmd'; savedSource = ''; savedName = filename;
  replaceDocument('flowchart TD\n'); message('Nuevo diagrama. Añade un nodo para empezar.');
};
$('open').onclick = () => $<HTMLInputElement>('file').click();
$('file').onchange = () => { const input = $<HTMLInputElement>('file'); if (input.files?.[0]) void loadFile(input.files[0]); input.value = ''; };
$('undo').onclick = () => undo(editor); $('redo').onclick = () => redo(editor);
$('add-node').onclick = () => openNode(); $('add-edge').onclick = () => openEdge();
$('fit-view').onclick=()=>{cancelDragPreview();fit();paintPortHandles();message('Diagrama encajado en pantalla.');};
$('relayout').onclick=()=>{
  if(!flow||(!valid&&!recoverableLayout)||busy)return;
  cancelDragPreview();cancelConnectionPick(false);pendingSelection=null;needsFit=true;
  const text=resetLayout(source());
  if(text===source()){fit();needsFit=false;}else setSource(text);
  message('Distribución automática recuperada. Puedes deshacer para volver a la colocación anterior.');
};
$('direction').onchange = () => { if (flow && valid && !busy) { const next = structuredClone(flow); next.direction = $<HTMLSelectElement>('direction').value as Direction; next.constraints = []; applyFlow(next); } };
$('copy').onclick = async () => {
  const block = '```mermaid\n' + source().trimEnd() + '\n```';
  try { await navigator.clipboard.writeText(block); message('Bloque Mermaid copiado.'); }
  catch { download(new Blob([block], { type: 'text/markdown;charset=utf-8' }), filename.replace(/\.mmd$/i, '.md')); message('El navegador no permite copiar. Se ha descargado el bloque Markdown.'); }
};
for (const format of ['svg', 'png']) $(format).onclick = async () => {
  if (!current || !valid || busy || renderedSource !== source()) return;
  const root = $('diagram').querySelector('svg'); if (!root) return;
  const svg = svgDocument(root), name = filename.replace(/\.mmd$/i, `.${format}`);
  try {
    download(format === 'svg' ? new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }) : await pngBlob(svg, current.geometry.width, current.geometry.height), name);
    message(`Exportado ${name}.`);
  } catch { message(`No se pudo exportar ${format.toUpperCase()}. Prueba a descargar SVG.`); }
};
window.addEventListener('beforeunload', event => { if (dirty()) { event.preventDefault(); event.returnValue = ''; } });
window.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); saveFile(); }
});
$('diagram-viewport').addEventListener('keydown', event => {
  if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); deleteSelection(); }
});
window.addEventListener('dragover', event => { if (event.dataTransfer?.types.includes('Files')) { event.preventDefault(); app.classList.add('file-drag'); } });
window.addEventListener('dragleave', event => { if (!event.relatedTarget) app.classList.remove('file-drag'); });
window.addEventListener('drop', event => { event.preventDefault(); app.classList.remove('file-drag'); if (event.dataTransfer?.files[0]) void loadFile(event.dataTransfer.files[0]); });

interface Drag {
  pointer:number; mode:'nodes'|'pan'|'marquee'|'port'|'bend'|'group'|'group-resize'; id?:string; start:Point; previous:Point; moved:boolean; token:number;
  inverse:DOMMatrix; camera:{x:number;y:number;zoom:number}; layout:ManualLayout|null; startPoint:Point;
  origins:Record<string,Point>; edge?:number; end?:'from'|'to'; originalConnections:Connections;handleOffset?:Point;
  baseNodes:string[];baseEdges:number[];
  originalRoot?:SVGSVGElement;
  group?:string;groupOrigin?:GroupBox;corner?:string;
  items:Array<{node?:string;edge?:number;x:number;y:number;right:number;bottom:number}>;
}
let drag:Drag|null=null;
let lastNodeClick:{id:string;time:number}|null=null;
let lastEdgeClick:{index:number;time:number}|null=null;
let spacePressed=false;
const viewport=$('diagram-viewport');
function release(state:Drag) { if(viewport.hasPointerCapture(state.pointer))viewport.releasePointerCapture(state.pointer); }
function cancelDragPreview() {
  if(pointerFrame)cancelAnimationFrame(pointerFrame);pointerFrame=0;
  const state=drag;drag=null;$('selection-box').hidden=true;
  if(!state)return;
  if(state.mode==='nodes')state.layout?.moveMany(state.origins);
  if((state.mode==='port'||state.mode==='bend')&&state.layout) {
    for(const key of Object.keys(state.layout.connections))delete state.layout.connections[key];
    Object.assign(state.layout.connections,state.originalConnections);state.layout.apply({...current!.geometry.nodes});paintPortHandles(state.layout);
  }
  if(state.mode==='marquee') {
    selectedNodes.clear();selectedEdges.clear();state.baseNodes.forEach(id=>selectedNodes.add(id));state.baseEdges.forEach(i=>selectedEdges.add(i));markSelection();
  }
  if(state.originalRoot) $('diagram').replaceChildren(state.originalRoot);
  release(state);
}
function paintDragFrame() {
  pointerFrame=0;const state=drag;if(!state?.moved||state.token!==generation)return;
  if(state.mode==='pan') {
    view.x=state.camera.x+state.previous.x-state.start.x;view.y=state.camera.y+state.previous.y-state.start.y;transform();return;
  }
  if(state.mode==='marquee') {
    const x=Math.min(state.start.x,state.previous.x),y=Math.min(state.start.y,state.previous.y),right=Math.max(state.start.x,state.previous.x),bottom=Math.max(state.start.y,state.previous.y);
    const box=$('selection-box'), viewportBox=viewport.getBoundingClientRect();box.hidden=false;
    Object.assign(box.style,{left:(x-viewportBox.left)+'px',top:(y-viewportBox.top)+'px',width:(right-x)+'px',height:(bottom-y)+'px'});
    selectedNodes.clear();selectedEdges.clear();state.baseNodes.forEach(id=>selectedNodes.add(id));state.baseEdges.forEach(i=>selectedEdges.add(i));
    for(const item of state.items) {
      const inside=item.node ? item.right>=x&&item.x<=right&&item.bottom>=y&&item.y<=bottom : item.x>=x&&item.right<=right&&item.y>=y&&item.bottom<=bottom;
      if(inside) { if(item.node)selectedNodes.add(item.node);else if(item.edge!==undefined)selectedEdges.add(item.edge); }
    }
    markSelection();return;
  }
  if(!state.layout) { state.originalRoot=$('diagram').querySelector('svg')!.cloneNode(true) as SVGSVGElement; state.layout=sceneLayout();state.layout.apply({...current!.geometry.nodes});
    if(state.mode==='nodes')for(const group of state.layout.root.querySelectorAll('g.cluster')) {
      const id=mermaidSourceId(group),box=state.layout.groupBox(id);if(box&&!state.layout.groups[id])state.layout.groups[id]=box;
    }
  }
  const point=new DOMPoint(state.previous.x,state.previous.y).matrixTransform(state.inverse);
  point.x-=state.handleOffset?.x??0;point.y-=state.handleOffset?.y??0;
  if(state.mode==='bend'){state.layout.setBend(state.edge!,state.end!,point);paintPortHandles(state.layout);return;}
  if(state.mode==='port') {
    const port=state.layout.endpoint(state.edge!,state.end!);if(!port)return;
    const angle=Math.atan2(point.y-port.center.y,point.x-port.center.x)*180/Math.PI;
    state.layout.setPort(state.edge!,state.end!,angle);paintPortHandles(state.layout);return;
  }
  const dx=point.x-state.startPoint.x,dy=point.y-state.startPoint.y;
  if(state.mode==='group'||state.mode==='group-resize') {
    const box={...state.groupOrigin!};
    if(state.mode==='group'){box.x+=dx;box.y+=dy;}
    else {
      const corner=state.corner!;
      if(corner.includes('w')){const d=Math.min(dx,box.width-40);box.x+=d;box.width-=d;}else box.width=Math.max(40,box.width+dx);
      if(corner.includes('n')){const d=Math.min(dy,box.height-40);box.y+=d;box.height-=d;}else box.height=Math.max(40,box.height+dy);
    }
    state.layout.setGroupBox(state.group!,box);paintGroupHandles(state.layout);return;
  }
  state.layout.moveMany(Object.fromEntries(Object.entries(state.origins).map(([id,p])=>[id,{x:p.x+dx,y:p.y+dy}])));
}
function commitScene(layout:ManualLayout) {
  if(!current||!flow)return;
  layout.root.querySelectorAll('.selection-ring,.port-handle,.bend-handle,.port-guide,.group-handle,.group-selection').forEach(el=>el.remove());
  layout.resizeGroups();
  // Guardar los rectángulos efectivos, también los calculados automáticamente.
  for(const group of flow.groups??[]){const box=layout.groupBox(group.id);if(box)layout.groups[group.id]=box;}
  const root=layout.root,before={x:root.viewBox.baseVal.x,y:root.viewBox.baseVal.y};
  layout.bounds();view.x+=(root.viewBox.baseVal.x-before.x)*view.zoom;view.y+=(root.viewBox.baseVal.y-before.y)*view.zoom;
  let text=writePositions(source(),current.geometry.nodes);
  if(Object.keys(layout.connections).length||text.includes('%% graph:connections '))text=writeConnections(text,layout.connections);
  if(Object.keys(layout.groups).length||text.includes('%% graph:groups '))text=writeGroups(text,layout.groups);
  savingPositions=true;
  try{setSource(text);}finally{savingPositions=false;keepView=false;}
  const parsed=parseFlow(text);flow=parsed.ok?parsed.flow:flow;renderedSource=text;
  sizeDiagram();transform();current.svg=root.outerHTML;updateControls();markSelection();$('render-state').textContent='Actualizado';
  message('Posición guardada en el .mmd. Puedes deshacer el movimiento.');
}
viewport.onpointerdown=event=>{
  if((event.button!==0&&event.button!==1)||busy)return;
  const target=event.target as Element;if(target.closest('#diagram-fullscreen'))return;if(target.closest('a')){event.preventDefault();return;}
  cancelDragPreview();
  const root=$('diagram').querySelector('svg'),matrix=root?.getScreenCTM();if(!root||!matrix||!current)return;
  const inverse=matrix.inverse(),startPoint=new DOMPoint(event.clientX,event.clientY).matrixTransform(inverse);
  const node=target.closest<SVGGElement>('[data-node-id]'),edge=target.closest<SVGElement>('[data-edge-index],[data-hit-edge],[data-edge-label]'),port=target.closest<SVGElement>('[data-port-edge]'),bend=target.closest<SVGElement>('[data-bend-edge]');
  const pan=event.button===1||spacePressed;
  if(!pan)selectionOrigin='diagram';
  if(connectionPick&&!pan){pickPressed=node?.dataset.nodeId??null;viewport.focus();event.preventDefault();return;}
  const resizeHandle=target.closest<SVGElement>('[data-group-resize]');
  const cluster=target.closest('g.cluster');
  const group=resizeHandle?selectedGroup:cluster?mermaidSourceId(cluster):undefined;
  let mode:Drag['mode']=pan?'pan':port?'port':bend?'bend':node&&flow&&valid?'nodes':group&&flow&&valid?(resizeHandle?'group-resize':'group'):'marquee';
  const id=node?.dataset.nodeId;
  const additive=event.shiftKey||event.ctrlKey||event.metaKey;
  const baseNodes=[...selectedNodes],baseEdges=[...selectedEdges];
  if(!pan&&!port&&!bend&&edge&&flow&&valid) {
    selectedGroup=null;
    const index=Number(edge.dataset.edgeIndex ?? edge.dataset.hitEdge ?? edge.dataset.edgeLabel);
    if(!additive){selectedNodes.clear();selectedEdges.clear();}
    if(additive&&selectedEdges.has(index))selectedEdges.delete(index);else selectedEdges.add(index);
    const time=performance.now(),edit= !additive&&lastEdgeClick?.index===index&&time-lastEdgeClick.time<450;
    lastEdgeClick=edit?null:{index,time};lastNodeClick=null;
    markSelection();viewport.focus();if(edit)openEdge(index);event.preventDefault();return;
  }
  lastEdgeClick=null;
  if(mode==='group'||mode==='group-resize') {
    selectedGroup=group!;selectedNodes.clear();selectedEdges.clear();markSelection();
  }
  if(mode==='nodes'&&id) {
    selectedGroup=null;
    if(additive) { if(selectedNodes.has(id))selectedNodes.delete(id);else selectedNodes.add(id); }
    else if(!selectedNodes.has(id)){selectedNodes.clear();selectedEdges.clear();selectedNodes.add(id);}
    markSelection();
    if(!selectedNodes.has(id)){event.preventDefault();return;}
  } else if(mode==='marquee'&&!additive){selectedGroup=null;selectedNodes.clear();selectedEdges.clear();markSelection();}
  const origins=Object.fromEntries([...selectedNodes].filter(id=>current!.geometry.nodes[id]).map(id=>[id,{...current!.geometry.nodes[id]}]));
  const items:Drag['items']=[];
  if(mode==='marquee') {
    for(const el of root.querySelectorAll<SVGGraphicsElement>('[data-node-id],.edgePaths path.flowchart-link')) {
      const box=el.getBoundingClientRect();items.push({node:el.dataset.nodeId,edge:el.dataset.edgeIndex===undefined?undefined:Number(el.dataset.edgeIndex),x:box.left,y:box.top,right:box.right,bottom:box.bottom});
    }
  }
  drag={pointer:event.pointerId,mode,id,start:{x:event.clientX,y:event.clientY},previous:{x:event.clientX,y:event.clientY},moved:false,token:generation,
    inverse,camera:{...view},layout:null,startPoint,origins,edge:port?Number(port.dataset.portEdge):bend?Number(bend.dataset.bendEdge):undefined,end:(port?.dataset.portEnd??bend?.dataset.bendEnd) as 'from'|'to'|undefined,
    group:group??undefined,groupOrigin:group?sceneLayout().groupBox(group)??undefined:undefined,corner:resizeHandle?.dataset.groupResize,
    handleOffset:port||bend?{x:Number((port??bend)!.dataset.handleOffsetX??0),y:Number((port??bend)!.dataset.handleOffsetY??0)}:undefined,
    originalConnections:readConnections(source()),baseNodes:mode==='marquee'&&additive?baseNodes:[],baseEdges:mode==='marquee'&&additive?baseEdges:[],items};
  viewport.setPointerCapture(event.pointerId);viewport.focus();event.preventDefault();
};
viewport.onpointermove=event=>{
  if(!drag||drag.pointer!==event.pointerId)return;
  drag.previous={x:event.clientX,y:event.clientY};
  if(!drag.moved&&Math.hypot(event.clientX-drag.start.x,event.clientY-drag.start.y)>4)drag.moved=true;
  if(drag.moved&&!pointerFrame)pointerFrame=requestAnimationFrame(paintDragFrame);
};
viewport.onpointerup=event=>{
  if(connectionPick&&!drag&&pickPressed){const id=pickPressed;pickPressed=null;pickConnectionNode(id);return;}
  if(!drag||drag.pointer!==event.pointerId)return;
  const state=drag;state.previous={x:event.clientX,y:event.clientY};
  if(pointerFrame)cancelAnimationFrame(pointerFrame);pointerFrame=0;
  if(!state.moved){
    // Un clic en el fondo limpia la selección; no restaura la selección anterior.
    drag=null;release(state);
    if(state.mode==='nodes'&&state.id&&selectedNodes.size===1){
      const time=performance.now();
      if(lastNodeClick?.id===state.id&&time-lastNodeClick.time<450){lastNodeClick=null;openNode(state.id);}
      else lastNodeClick={id:state.id,time};
    }else lastNodeClick=null;
    return;
  }
  lastNodeClick=null;paintDragFrame();drag=null;release(state);$('selection-box').hidden=true;
  if((state.mode==='nodes'||state.mode==='port'||state.mode==='bend'||state.mode==='group'||state.mode==='group-resize')&&state.layout&&state.token===generation&&valid)commitScene(state.layout);
};
viewport.onpointercancel=()=>{cancelDragPreview();$('render-state').textContent=valid?'Actualizado':'Actualizando…';};
window.addEventListener('keydown',event=>{
  if(event.code==='Space'&&!(event.target as Element).closest('input,textarea,.cm-editor,[contenteditable="true"]')){spacePressed=true;event.preventDefault();}
  if(event.key==='Escape'&&inspectorMode&&!document.querySelector('dialog[open]')){event.preventDefault();closeInspectorForm();return;}
  if(event.key==='Escape'&&connectionPick){event.preventDefault();cancelConnectionPick();return;}
  if(event.key==='Escape'&&drag?.moved){event.preventDefault();cancelDragPreview();updateControls();$('render-state').textContent='Actualizado';message('Movimiento cancelado.');}
});
window.addEventListener('keyup',event=>{if(event.code==='Space')spacePressed=false;});
window.addEventListener('blur',()=>{spacePressed=false;cancelDragPreview();});
viewport.addEventListener('wheel',event=>{
  event.preventDefault();const rect=viewport.getBoundingClientRect();
  const delta=event.deltaY*(event.deltaMode===WheelEvent.DOM_DELTA_LINE?16:event.deltaMode===WheelEvent.DOM_DELTA_PAGE?rect.height:1);
  zoom(Math.exp(-delta*0.002*getPreferences().zoomSpeed),event.clientX-rect.left,event.clientY-rect.top);paintPortHandles();
  if(drag){drag.camera={...view};const matrix=$('diagram').querySelector('svg')?.getScreenCTM();if(matrix)drag.inverse=matrix.inverse();if(drag.mode==='pan')drag.start={...drag.previous};}
},{passive:false});


const splitter = $('splitter');
function resize(percent: number) {
  const clamped = Math.min(65, Math.max(20, percent));
  $('workspace').style.setProperty('--code-width', `${clamped}%`); splitter.setAttribute('aria-valuenow', String(Math.round(clamped)));
}
splitter.onpointerdown = event => { splitter.setPointerCapture(event.pointerId); };
splitter.onpointermove = event => { if (splitter.hasPointerCapture(event.pointerId)) { const box = $('workspace').getBoundingClientRect(); resize((event.clientX - box.left) / box.width * 100); } };
splitter.onpointerup = event => { if (splitter.hasPointerCapture(event.pointerId)) splitter.releasePointerCapture(event.pointerId); };
splitter.onkeydown = event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); resize(Number(splitter.getAttribute('aria-valuenow')) + (event.key === 'ArrowRight' ? 3 : -3)); } };
let viewportWidth = viewport.clientWidth;
new ResizeObserver(() => {
  if (viewport.clientWidth !== viewportWidth) { viewportWidth = viewport.clientWidth; if (!drag) fit(); }
}).observe(viewport);
window.addEventListener('resize', () => { if (!drag) fit(); });
let beforeDiagramMode: { x: number; y: number; zoom: number } | null = null;
setupWorkspaceControls({
  onDiagramModeChange(expanded) {
    viewport.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true }));
    if(expanded)document.querySelector('.preview-pane')!.insertBefore($('inspector'),$('error'));
    else document.querySelector('.code-pane')!.insertBefore($('inspector'),document.querySelector('.code-footer'));
    if (expanded) beforeDiagramMode = { ...view };
    const previous = beforeDiagramMode;
    // Esperar al cambio de tamaño para que la cámara se restaure tras los observadores.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (expanded) fit();
      else if (previous) { view = previous; transform(); }
      editor.requestMeasure();
    }));
  },
  onToolbarChange() { editor.requestMeasure(); },
});
const initialPane=getPreferences().defaultPane;
try{setPaneMode(initialPane==='remember'?(localStorage.getItem('mermaid-bp:pane-mode')==='cascade'?'cascade':'code'):initialPane);}catch{setPaneMode(initialPane==='cascade'?'cascade':'code');}
persist();
setupInspectorResize(()=>editor.requestMeasure());
setupSettings(()=>{editor.dispatch({effects:codeAppearance.reconfigure(codeAppearanceExtensions())});editor.requestMeasure();},async()=>{await pluginHost?.reloadInstalled();});
pluginHost=new PluginHost(()=>({source:source(),fileName:filename}),message);
void pluginHost.start();
setupTour(()=>pluginHost!.guideSteps(),()=>paneMode,setPaneMode);
void render();
