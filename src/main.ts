import { EditorState, Transaction } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection } from '@codemirror/view';
import { history, historyKeymap, defaultKeymap, undo, redo, isolateHistory } from '@codemirror/commands';
import { bracketMatching } from '@codemirror/language';
import { example, parseFlow, serializeFlow, nextId, removeNode, edgePathMap, type Flow, type Shape, type Direction } from './flow';
import { layoutCandidates, scoreLayout, type Point } from './layout';
import { renderDiagram, download, pngBlob, svgDocument, type Rendered } from './render';
import './style.css';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const app = $('app');
app.innerHTML = `
  <header class="topbar">
    <a class="brand" href="./" aria-label="Mermaid BP, inicio"><span class="brand-mark">m<span>↗</span></span><span>mermaid<span class="brand-bp"> / bp</span></span></a>
    <div class="file-state"><span class="status-dot"></span><span id="filename">diagrama.mmd</span><span id="dirty" aria-label="Cambios sin descargar">●</span></div>
    <span class="local-badge">local · sin cuenta</span>
  </header>
  <nav class="toolbar" aria-label="Archivo y edición">
    <div class="toolbar-group"><button id="new">Nuevo</button><button id="open">Abrir .mmd</button><input id="file" type="file" accept=".mmd,.mermaid,text/plain" hidden><button id="save" class="primary">Guardar .mmd <kbd>Ctrl S</kbd></button></div>
    <div class="toolbar-group"><button id="undo" title="Deshacer">↶ <span>Deshacer</span></button><button id="redo" title="Rehacer">↷ <span>Rehacer</span></button></div>
    <div class="toolbar-group export-group"><button id="copy">Copiar para BookStack</button><button id="svg">SVG</button><button id="png">PNG</button><a class="button quiet" href="./bookstack.html" target="_blank" rel="noopener">Comprobar BS ↗</a></div>
  </nav>
  <main id="workspace" class="workspace">
    <section class="code-pane" aria-label="Código Mermaid">
      <div class="pane-heading"><h1>Código <span>.mmd</span></h1><span id="line-count">0 líneas</span></div>
      <div id="editor"></div>
      <div class="code-footer"><span>Mermaid 11.7.0</span><span id="draft-status">Borrador local</span></div>
    </section>
    <div id="splitter" class="splitter" role="separator" tabindex="0" aria-label="Ancho del editor" aria-orientation="vertical" aria-valuemin="20" aria-valuemax="65" aria-valuenow="38"></div>
    <section class="preview-pane" aria-label="Vista previa del diagrama">
      <div class="pane-heading"><h2>Diagrama</h2><span id="render-state" class="render-state">Preparando…</span><div class="zoom-tools"><button id="zoom-out" aria-label="Alejar">−</button><button id="fit">Encajar</button><button id="zoom-in" aria-label="Acercar">+</button></div></div>
      <div class="visual-toolbar"><button id="add-node">+ Nodo</button><button id="add-edge">+ Conexión</button><label>Dirección <select id="direction" aria-label="Dirección del diagrama"><option value="TD">↓ vertical</option><option value="LR">→ horizontal</option><option value="BT">↑ vertical</option><option value="RL">← horizontal</option></select></label><span id="visual-mode">Edición visual</span></div>
      <div id="diagram-viewport" class="diagram-viewport" tabindex="0" aria-label="Lienzo. Arrastra el fondo para desplazarte y los nodos para ajustar su distribución."><div id="diagram-stage" class="diagram-stage"><div id="diagram"></div></div><div id="empty" class="empty" hidden>Escribe Mermaid o abre un archivo para empezar.</div><div id="drag-ghost" hidden></div></div>
      <div id="selection" class="selection-panel" hidden></div>
      <div id="error" class="error-panel" role="alert" hidden></div>
      <div id="visual-note" class="visual-note">Arrastra un nodo para solicitar un ajuste compatible con BookStack.</div>
    </section>
  </main>
  <footer class="statusbar"><span id="message" role="status" aria-live="polite">Todo se queda en este navegador.</span><span>.mmd → BookStack</span></footer>
  <dialog id="confirm-dialog"><form method="dialog"><h2>Hay cambios sin descargar</h2><p>Guarda el archivo antes de sustituirlo si quieres conservar esta versión.</p><div class="dialog-actions"><button value="cancel">Cancelar</button><button value="save" class="primary">Guardar y continuar</button><button value="replace">Continuar sin descargar</button></div></form></dialog>
  <dialog id="node-dialog"><form id="node-form"><h2 id="node-title">Nuevo nodo</h2><label>Texto<textarea id="node-label" rows="3" required></textarea></label><label>Forma<select id="node-shape"><option value="rect">Rectángulo</option><option value="round">Redondeado</option><option value="stadium">Terminal</option><option value="diamond">Rombo</option><option value="circle">Círculo</option></select></label><div class="dialog-actions"><button type="button" id="node-cancel">Cancelar</button><button class="primary" type="submit">Aplicar</button></div></form></dialog>
  <dialog id="edge-dialog"><form id="edge-form"><h2 id="edge-title">Nueva conexión</h2><div class="form-row"><label>Origen<select id="edge-from"></select></label><label>Destino<select id="edge-to"></select></label></div><label>Texto opcional<input id="edge-label"></label><label>Tipo<select id="edge-arrow"><option value="-->">Flecha</option><option value="---">Línea</option><option value="-.->">Flecha discontinua</option></select></label><div class="dialog-actions"><button type="button" id="edge-cancel">Cancelar</button><button class="primary" type="submit">Aplicar</button></div></form></dialog>
`;

const STORAGE = 'mermaid-bp:draft:v1';
interface Draft { source: string; name: string; savedSource: string; savedName: string }
let recovered: Draft | null = null;
try {
  const candidate = JSON.parse(localStorage.getItem(STORAGE) || 'null');
  if (candidate && typeof candidate.source === 'string' && typeof candidate.name === 'string' && typeof candidate.savedSource === 'string' && typeof candidate.savedName === 'string') recovered = candidate;
} catch { /* Un borrador corrupto no impide abrir el editor. */ }
let lineEnding = recovered?.source.includes('\r\n') ? '\r\n' : '\n';
let keepView = false;
let filename = recovered?.name ?? 'diagrama.mmd';
let savedSource = recovered?.savedSource ?? '';
let savedName = recovered?.savedName ?? filename;
let generation = 0;
let renderTimer: ReturnType<typeof setTimeout>;
let current: Rendered | null = null;
let renderedSource = '';
let flow: Flow | null = null;
let valid = false;
let busy = false;
let selected: { node?: string; edge?: number } = {};
let view = { x: 0, y: 0, zoom: 1 };
let editingNode: string | null = null;
let editingEdge: number | null = null;
const editorExtensions = [
    lineNumbers(), history(), drawSelection(), highlightActiveLine(), bracketMatching(),
    keymap.of([...defaultKeymap, ...historyKeymap, { key: 'Mod-s', run: () => { saveFile(); return true; } }]),
    EditorView.lineWrapping, EditorView.contentAttributes.of({ 'aria-label': 'Código Mermaid', spellcheck: 'false' }),
    EditorView.updateListener.of(update => { if (update.docChanged) changed(); }),
  ];
const editor = new EditorView({ state: EditorState.create({ doc: recovered?.source ?? example, extensions: editorExtensions }), parent: $('editor') });
const source = () => editor.state.doc.toString().replace(/\n/g, lineEnding);
const dirty = () => source() !== savedSource || filename !== savedName;
function message(text: string) { $('message').textContent = text; }
function persist() {
  try {
    localStorage.setItem(STORAGE, JSON.stringify({ source: source(), name: filename, savedSource, savedName } satisfies Draft));
    $('draft-status').textContent = 'Borrador guardado';
  } catch { $('draft-status').textContent = 'No se pudo guardar el borrador'; }
  $('filename').textContent = filename;
  $('dirty').hidden = !dirty();
  $('line-count').textContent = `${editor.state.doc.lines} líneas`;
}
function changed() {
  generation++; busy = false; valid = false; selected = {};
  if (!keepView) lastNodeClick = null;
  updateControls(); persist();
  $('render-state').textContent = 'Actualizando…';
  clearTimeout(renderTimer); renderTimer = setTimeout(render, 350);
}
function setSource(text: string) {
  keepView = true;
  editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: text }, annotations: [Transaction.userEvent.of('input.visual'), isolateHistory.of('full')] });
}
function applyFlow(next: Flow) { setSource(serializeFlow(next)); }
function updateControls() {
  const enabled = !!flow && valid && !busy;
  for (const id of ['add-node', 'add-edge', 'direction']) ($<HTMLButtonElement>(id)).disabled = !enabled || (id === 'add-edge' && flow!.nodes.length === 0);
  for (const id of ['svg', 'png']) $<HTMLButtonElement>(id).disabled = !valid || !current || busy;
  $('selection').hidden = true;
  $('diagram').classList.toggle('visual-enabled', enabled);
  if (selected.node && enabled) showSelection();
  else if (selected.edge !== undefined && enabled) showSelection();
}
async function render() {
  const token = generation, text = source();
  const parsed = parseFlow(text);
  flow = parsed.ok ? parsed.flow : null;
  if (flow) $<HTMLSelectElement>('direction').value = flow.direction === 'TB' ? 'TD' : flow.direction;
  $('visual-mode').textContent = parsed.ok ? 'Edición visual' : 'Edición por código';
  $('visual-note').textContent = parsed.ok ? 'Arrastra un nodo para solicitar un ajuste compatible con BookStack.' : `${parsed.reason} El código se conserva íntegro.`;
  if (!text.trim()) {
    $('empty').hidden = false; $('diagram').innerHTML = ''; current = null; valid = false;
    $('error').hidden = true; $('render-state').textContent = 'Sin diagrama'; updateControls(); return;
  }
  try {
    const result = await renderDiagram(text, flow ?? undefined);
    if (token !== generation) return;
    current = result; renderedSource = text; valid = true;
    $('diagram').innerHTML = result.svg; $('empty').hidden = true; $('error').hidden = true;
    decorate();
    sizeDiagram();
    if (keepView) transform(); else fit();
    keepView = false;
    updateControls(); $('render-state').textContent = 'Actualizado';
  } catch (error) {
    if (token !== generation) return;
    valid = false; $('error').hidden = false;
    $('error').textContent = `Revisa el código. ${error instanceof Error ? error.message : String(error)}`;
    $('render-state').textContent = current ? 'Vista anterior · código con errores' : 'Código con errores';
    updateControls();
  }
}
function decorate() {
  if (!flow) return;
  for (const node of $('diagram').querySelectorAll<SVGGElement>('g.node')) {
    const model = flow.nodes.find(n => node.id.startsWith(`flowchart-${n.id}-`));
    if (model) { node.dataset.nodeId = model.id; node.classList.add('editable-node'); }
  }
  const pathMap = edgePathMap(flow);
  $('diagram').querySelectorAll<SVGPathElement>('.edgePaths path.flowchart-link').forEach(path => {
    const index = pathMap.get(path.id);
    if (index !== undefined) path.dataset.edgeIndex = String(index);
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
  view.zoom = Math.min(1.4, Math.max(0.05, Math.min((viewport.clientWidth - 70) / current.geometry.width, (viewport.clientHeight - 70) / current.geometry.height)));
  view.x = (viewport.clientWidth - current.geometry.width * view.zoom) / 2;
  view.y = (viewport.clientHeight - current.geometry.height * view.zoom) / 2;
  sizeDiagram();
  transform();
}
function zoom(factor: number, x?: number, y?: number) {
  const box = $('diagram-viewport').getBoundingClientRect();
  const cx = x ?? box.width / 2, cy = y ?? box.height / 2;
  const previous = view.zoom; view.zoom = Math.min(5, Math.max(0.05, previous * factor));
  view.x = cx - (cx - view.x) * view.zoom / previous; view.y = cy - (cy - view.y) * view.zoom / previous;
  transform();
}
function showSelection() {
  const panel = $('selection'); panel.replaceChildren(); panel.hidden = false;
  const label = document.createElement('span');
  const node = flow?.nodes.find(n => n.id === selected.node);
  label.textContent = node ? `${node.id} · ${node.label}` : 'Conexión seleccionada'; panel.append(label);
  const edit = document.createElement('button'); edit.textContent = 'Editar';
  edit.onclick = () => node ? openNode(node.id) : openEdge(selected.edge);
  const remove = document.createElement('button'); remove.textContent = 'Eliminar'; remove.className = 'danger'; remove.onclick = deleteSelection;
  panel.append(edit, remove);
}
function markSelection() {
  $('diagram').querySelectorAll('.selection-ring').forEach(el => el.remove());
  $('diagram').querySelectorAll('.selected-edge').forEach(el => el.classList.remove('selected-edge'));
  if (selected.node) {
    const group = [...$('diagram').querySelectorAll<SVGGElement>('[data-node-id]')].find(n => n.dataset.nodeId === selected.node);
    if (group) {
      const b = group.getBBox(); const ring = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      ring.setAttribute('x', String(b.x - 5)); ring.setAttribute('y', String(b.y - 5)); ring.setAttribute('width', String(b.width + 10)); ring.setAttribute('height', String(b.height + 10)); ring.setAttribute('rx', '6'); ring.setAttribute('class', 'selection-ring'); group.append(ring);
    }
  }
  if (selected.edge !== undefined) $('diagram').querySelector(`[data-edge-index="${selected.edge}"]`)?.classList.add('selected-edge');
  if (selected.node || selected.edge !== undefined) showSelection(); else $('selection').hidden = true;
}
function deleteSelection() {
  if (!flow || !valid || busy) return;
  const next = structuredClone(flow);
  if (selected.node) removeNode(next, selected.node);
  else if (selected.edge !== undefined) next.edges.splice(selected.edge, 1);
  else return;
  selected = {}; applyFlow(next);
}
function openNode(id?: string) {
  if (!flow || !valid || busy) return;
  editingNode = id ?? null;
  const node = flow.nodes.find(n => n.id === id);
  $('node-title').textContent = node ? 'Editar nodo' : 'Nuevo nodo';
  $<HTMLTextAreaElement>('node-label').value = node?.label ?? '';
  $<HTMLSelectElement>('node-shape').value = node?.shape ?? 'rect';
  $<HTMLDialogElement>('node-dialog').showModal(); $<HTMLTextAreaElement>('node-label').focus();
}
function openEdge(index?: number) {
  if (!flow || !valid || busy) return;
  editingEdge = index ?? null;
  const edge = index === undefined ? undefined : flow.edges[index];
  $('edge-title').textContent = edge ? 'Editar conexión' : 'Nueva conexión';
  for (const id of ['edge-from', 'edge-to']) {
    const select = $<HTMLSelectElement>(id); select.replaceChildren();
    for (const node of flow.nodes) select.add(new Option(`${node.id} · ${node.label}`, node.id));
  }
  $<HTMLSelectElement>('edge-from').value = edge?.from ?? selected.node ?? flow.nodes[0].id;
  $<HTMLSelectElement>('edge-to').value = edge?.to ?? flow.nodes[Math.min(1, flow.nodes.length - 1)].id;
  $<HTMLInputElement>('edge-label').value = edge?.label ?? '';
  const arrowSelect = $<HTMLSelectElement>('edge-arrow');
  arrowSelect.querySelector('[data-extra]')?.remove();
  if (edge && !['-->', '---', '-.->'].includes(edge.arrow)) { const option = new Option('Flecha con separación', edge.arrow); option.dataset.extra = 'true'; arrowSelect.add(option); }
  arrowSelect.value = edge?.arrow ?? '-->';
  $<HTMLDialogElement>('edge-dialog').showModal();
}
$('node-form').onsubmit = event => {
  event.preventDefault(); if (!flow || !valid || busy) return;
  const next = structuredClone(flow), label = $<HTMLTextAreaElement>('node-label').value, shape = $<HTMLSelectElement>('node-shape').value as Shape;
  const node = next.nodes.find(n => n.id === editingNode);
  if (node) { node.label = label; node.shape = shape; } else next.nodes.push({ id: nextId(next), label, shape });
  $<HTMLDialogElement>('node-dialog').close(); applyFlow(next);
};
$('edge-form').onsubmit = event => {
  event.preventDefault(); if (!flow || !valid || busy) return;
  const next = structuredClone(flow), edge = { from: $<HTMLSelectElement>('edge-from').value, to: $<HTMLSelectElement>('edge-to').value, label: $<HTMLInputElement>('edge-label').value, arrow: $<HTMLSelectElement>('edge-arrow').value };
  if (editingEdge === null) next.edges.push(edge); else next.edges[editingEdge] = { ...next.edges[editingEdge], ...edge };
  $<HTMLDialogElement>('edge-dialog').close(); applyFlow(next);
};
$('node-cancel').onclick = () => $<HTMLDialogElement>('node-dialog').close();
$('edge-cancel').onclick = () => $<HTMLDialogElement>('edge-dialog').close();

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
  if (file.size > 2_000_000) { message('El archivo supera el límite de 2 MB.'); return; }
  let text: string;
  try { text = await file.text(); } catch { message('No se pudo leer el archivo.'); return; }
  if (!(await mayReplace())) return;
  filename = file.name.replace(/\.(?:mmd|mermaid)$/i, '') + '.mmd'; savedSource = text; savedName = filename;
  replaceDocument(text); message(`Abierto ${filename}.`);
}
function replaceDocument(text: string) {
  lineEnding = text.includes('\r\n') ? '\r\n' : '\n';
  keepView = false;
  editor.setState(EditorState.create({ doc: text, extensions: editorExtensions }));
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
$('direction').onchange = () => { if (flow && valid && !busy) { const next = structuredClone(flow); next.direction = $<HTMLSelectElement>('direction').value as Direction; next.constraints = []; applyFlow(next); } };
$('fit').onclick = fit; $('zoom-in').onclick = () => zoom(1.2); $('zoom-out').onclick = () => zoom(1 / 1.2);
$('copy').onclick = async () => {
  const block = '```mermaid\n' + source().trimEnd() + '\n```';
  try { await navigator.clipboard.writeText(block); message('Bloque Mermaid copiado para BookStack.'); }
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

interface Drag { pointer: number; id?: string; start: Point; previous: Point; moved: boolean; token: number }
let drag: Drag | null = null;
let lastNodeClick: { id: string; time: number } | null = null;
const viewport = $('diagram-viewport');
viewport.onpointerdown = event => {
  if (event.button !== 0 || busy) return;
  const target = event.target as Element;
  if (target.closest('a')) { event.preventDefault(); return; }
  const node = target.closest<SVGGElement>('[data-node-id]');
  const edge = target.closest<SVGPathElement>('[data-edge-index]');
  if (edge && flow && valid) { selected = { edge: Number(edge.dataset.edgeIndex) }; markSelection(); return; }
  const id = node && flow && valid ? node.dataset.nodeId : undefined;
  selected = id ? { node: id } : {}; markSelection();
  drag = { pointer: event.pointerId, id, start: { x: event.clientX, y: event.clientY }, previous: { x: event.clientX, y: event.clientY }, moved: false, token: generation };
  viewport.setPointerCapture(event.pointerId); viewport.focus(); event.preventDefault();
};
viewport.onpointermove = event => {
  if (!drag || drag.pointer !== event.pointerId) return;
  if (Math.hypot(event.clientX - drag.start.x, event.clientY - drag.start.y) > 5) drag.moved = true;
  if (!drag.moved) return;
  if (drag.id) {
    const ghost = $('drag-ghost'), box = viewport.getBoundingClientRect();
    ghost.hidden = false; ghost.textContent = flow?.nodes.find(n => n.id === drag!.id)?.label ?? drag.id;
    ghost.style.left = `${event.clientX - box.left}px`; ghost.style.top = `${event.clientY - box.top}px`;
  } else { view.x += event.clientX - drag.previous.x; view.y += event.clientY - drag.previous.y; transform(); }
  drag.previous = { x: event.clientX, y: event.clientY };
};
viewport.onpointerup = event => {
  if (!drag) return;
  const finished = drag; drag = null; $('drag-ghost').hidden = true;
  if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
  if (!finished.moved) {
    if (finished.id && finished.token === generation) {
      const time = performance.now();
      if (lastNodeClick?.id === finished.id && time - lastNodeClick.time < 450) {
        lastNodeClick = null; openNode(finished.id);
      } else lastNodeClick = { id: finished.id, time };
    } else lastNodeClick = null;
    return;
  }
  lastNodeClick = null;
  if (!finished.id || finished.token !== generation || !flow || !valid || !current) return;
  const svg = $('diagram').querySelector('svg')!;
  const matrix = svg.getScreenCTM(); if (!matrix) return;
  const target = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
  void optimize(finished.id, { x: target.x, y: target.y });
};
viewport.onpointercancel = () => { drag = null; $('drag-ghost').hidden = true; };
viewport.addEventListener('wheel', event => {
  if (event.ctrlKey || event.metaKey) { event.preventDefault(); const rect = viewport.getBoundingClientRect(); zoom(Math.exp(-event.deltaY * 0.002), event.clientX - rect.left, event.clientY - rect.top); }
}, { passive: false });
async function optimize(id: string, target: Point) {
  if (!flow || !current) return;
  const token = generation, before = current.geometry, original = flow;
  const candidates = layoutCandidates(original, id, target, before);
  let best = scoreLayout(before, before, id, target), winner: Flow | null = null;
  busy = true; updateControls(); message('Probando ajustes de distribución…');
  for (let index = 0; index < candidates.length; index++) {
    if (token !== generation) return;
    $('render-state').textContent = `Ajustando ${index + 1}/${candidates.length}`;
    try {
      const candidate = candidates[index], result = await renderDiagram(serializeFlow(candidate), candidate);
      if (token !== generation) return;
      const score = scoreLayout(before, result.geometry, id, target);
      if (score + 0.025 < best) { best = score; winner = candidate; }
    } catch { /* Una alternativa inválida se descarta. */ }
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  if (token !== generation) return;
  busy = false;
  if (winner) { applyFlow(winner); message('Distribución ajustada con Mermaid. Puedes deshacer el cambio.'); }
  else { updateControls(); $('render-state').textContent = 'Actualizado'; message('Mermaid no ha encontrado un ajuste mejor para esa posición.'); }
}

const splitter = $('splitter');
function resize(percent: number) {
  const clamped = Math.min(65, Math.max(20, percent));
  $('workspace').style.setProperty('--code-width', `${clamped}%`); splitter.setAttribute('aria-valuenow', String(Math.round(clamped)));
}
splitter.onpointerdown = event => { splitter.setPointerCapture(event.pointerId); };
splitter.onpointermove = event => { if (splitter.hasPointerCapture(event.pointerId)) { const box = $('workspace').getBoundingClientRect(); resize((event.clientX - box.left) / box.width * 100); } };
splitter.onpointerup = event => { if (splitter.hasPointerCapture(event.pointerId)) splitter.releasePointerCapture(event.pointerId); fit(); };
splitter.onkeydown = event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); resize(Number(splitter.getAttribute('aria-valuenow')) + (event.key === 'ArrowRight' ? 3 : -3)); fit(); } };
let viewportWidth = viewport.clientWidth;
new ResizeObserver(() => {
  if (viewport.clientWidth !== viewportWidth) { viewportWidth = viewport.clientWidth; if (!drag) fit(); }
}).observe(viewport);
window.addEventListener('resize', () => { if (!drag) fit(); });
persist(); if (recovered) message('Se ha recuperado el último borrador de este navegador.');
void render();
