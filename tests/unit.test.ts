import {sameEdgeLabel} from '../src/edge-label.ts';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { parseFlow, serializeFlow, encodeLabel, decodeLabel, example, removeNode, nextId, edgePathMap } from '../src/flow.ts';
import { layoutCandidates, scoreLayout } from '../src/layout.ts';
import { pluginAssetPath } from '../src/desktop-plugin-bridge.ts';
function parsed(text: string) { const p = parseFlow(text); assert.ok(p.ok, p.ok ? '' : p.reason); return p.flow; }
test('construye rutas de assets de plugins con los separadores nativos', () => {
  assert.equal(pluginAssetPath('/home/user/.local/share/app/plugins/', 'demo', 'nested\\entry.js'), '/home/user/.local/share/app/plugins/demo/nested/entry.js');
  assert.equal(pluginAssetPath('C:\\Users\\user\\AppData\\plugins\\', 'demo', 'nested/entry.js'), 'C:\\Users\\user\\AppData\\plugins\\demo\\nested\\entry.js');
});
test('el ejemplo conserva nodos, conexiones, formas y etiquetas', () => {
  const flow = parsed(example);
  assert.equal(flow.nodes.length, 4); assert.equal(flow.edges.length, 4);
  assert.deepEqual(parsed(serializeFlow(flow)), flow);
});
test('admite declaraciones dentro de conexiones sin crear nodos duplicados', () => {
  const flow = parsed('graph LR\nA[Inicio] --> B{Listo}\nB --> A');
  assert.equal(flow.nodes.length, 2); assert.equal(flow.nodes[1].shape, 'diamond');
  assert.deepEqual(parsed(serializeFlow(flow)), flow);
});
test('escapa texto literal y conserva Unicode, comillas, entidades y saltos', () => {
  const labels = ['¿Sí? áéíóú ñ', '"Hola" & adiós', '#quot; #35; &#60;', '<br/> literal', 'primera\nsegunda', 'a | b', '<script>alert(1)</script>'];
  for (const label of labels) {
    assert.equal(decodeLabel(encodeLabel(label)), label);
    const flow = parsed('flowchart TD\nA["a"]'); flow.nodes[0].label = label;
    assert.equal(parsed(serializeFlow(flow)).nodes[0].label, label);
  }
});
test('conserva etiquetas de flechas con barras y comillas', () => {
  const flow = parsed('flowchart TD\nA --> B'); flow.edges[0].label = 'sí | "no" & #';
  assert.equal(parsed(serializeFlow(flow)).edges[0].label, flow.edges[0].label);
});
test('rechaza construcciones avanzadas sin modificar la entrada', () => {
  const inputs = [
    'sequenceDiagram\nA->>B: hola', 'flowchart TD\nsubgraph grupo\nA',
    'flowchart TD\nA --> B & C', 'flowchart TD\nA --> B\nlinkStyle 0 stroke:red',
    '---\nconfig:\n  theme: dark\n---\nflowchart TD\nA', 'flowchart TD\nA:::clase',
    'flowchart TD\nA[uno]\nA[dos]', 'flowchart TD\nA --> B; B --> C',
  ];
  for (const input of inputs) assert.equal(parseFlow(input).ok, false, input);
});
test('las restricciones se separan de las conexiones reales y sobreviven al guardado', () => {
  const flow = parsed('flowchart TD\nA --> B\nC\n%% mbp-layout:start\nA ~~~ C\n%% mbp-layout:end');
  assert.equal(flow.edges.length, 1); assert.equal(flow.constraints.length, 1);
  assert.deepEqual(parsed(serializeFlow(flow)), flow);
});
test('rechaza restricciones truncadas o con nodos inexistentes', () => {
  assert.equal(parseFlow('flowchart TD\nA\n%% mbp-layout:start\nA ~~~ B\n%% mbp-layout:end').ok, false);
  assert.equal(parseFlow('flowchart TD\nA\n%% mbp-layout:start').ok, false);
});
test('eliminar un nodo elimina sus conexiones y restricciones', () => {
  const flow = parsed('flowchart TD\nA --> B\nC --> B\n%% mbp-layout:start\nA ~~~ C\n%% mbp-layout:end');
  removeNode(flow, 'A'); assert.equal(flow.edges.length, 1); assert.equal(flow.constraints.length, 0);
  assert.equal(flow.nodes.some(n => n.id === 'A'), false);
});
test('genera identificadores libres y admite diagramas vacíos', () => {
  const flow = parsed('flowchart TD\nN1\nN3'); assert.equal(nextId(flow), 'N2');
  assert.equal(parsed('flowchart TD\n').nodes.length, 0);
});
test('conserva comentarios al editar', () => {
  const flow = parsed('%% nota de prueba\nflowchart TD\nA\n%% segunda nota');
  assert.deepEqual(parsed(serializeFlow(flow)).comments, flow.comments);
});
test('las alternativas preservan nodos, textos y extremos de conexiones', () => {
  const flow = parsed(example), original = structuredClone(flow);
  const geometry = { nodes: { Inicio: { x: 50, y: 0 }, Editar: { x: 50, y: 100 }, Revisar: { x: 50, y: 200 }, Guardar: { x: 50, y: 300 } }, width: 150, height: 400 };
  const candidates = layoutCandidates(flow, 'Editar', { x: 80, y: 240 }, geometry);
  assert.ok(candidates.length > 0 && candidates.length <= 8);
  for (const c of candidates) {
    assert.deepEqual([...c.nodes].sort((a, b) => a.id.localeCompare(b.id)), [...flow.nodes].sort((a, b) => a.id.localeCompare(b.id)));
    assert.deepEqual(c.edges.map(e => [e.from, e.to, e.label]), flow.edges.map(e => [e.from, e.to, e.label]));
    assert.equal(parsed(serializeFlow(c)).nodes.length, flow.nodes.length);
  }
  assert.deepEqual(flow, original);
});
test('el evaluador ignora traslaciones y prefiere acercar el nodo al destino', () => {
  const before = { nodes: { A: { x: 0, y: 0 }, B: { x: 100, y: 100 } }, width: 200, height: 200 };
  const shifted = { ...before, nodes: { A: { x: 20, y: 20 }, B: { x: 120, y: 120 } } };
  const target = { x: 70, y: 0 };
  assert.equal(scoreLayout(before, before, 'A', target), scoreLayout(before, shifted, 'A', target));
  const better = { ...before, nodes: { ...before.nodes, A: target } };
  assert.ok(scoreLayout(before, better, 'A', target) < scoreLayout(before, before, 'A', target));
  assert.equal(scoreLayout(before, { ...before, nodes: {} }, 'A', target), Infinity);
});
test('editar o eliminar un segmento de una cadena conserva el resto del grafo', () => {
  const flow = parsed('flowchart TD\nsubgraph G["grupo"]\n  A["a"] --> B["b"] --> C["c"]\nend\nclassDef base fill:#eee;\nclass A,B,C base;\n');
  flow.edges[1].label = 'revisión';
  const changed = parsed(serializeFlow(flow));
  assert.equal(changed.edges[1].label, 'revisión');
  assert.deepEqual(changed.nodes, flow.nodes);
  flow.edges.splice(0, 1);
  const deleted = parsed(serializeFlow(flow));
  assert.equal(deleted.edges.length, 1); assert.equal(deleted.nodes.length, 3);
  assert.equal(deleted.nodes.find(n => n.id === 'A')?.group, 'G');
});

test('Mermaid 11.7 numera las conexiones paralelas con 0, 2 y 3',()=>{
 const flow=parsed('flowchart LR\nA --> B\nA --> B\nA --> B\n'),paths=edgePathMap(flow);
 assert.equal(paths.get('L_A_B_0'),0);assert.equal(paths.get('L_A_B_2'),1);assert.equal(paths.get('L_A_B_3'),2);
 assert.equal(paths.has('L_A_B_1'),false);
});

test('los bucles recientes y los trazos antiguos se asignan a su conexión sin perder las siguientes',()=>{
 const flow=parsed('flowchart TD\nA -->|uno| A\nA --> B\nA -->|dos| A\nA -->|tres| A\n');const paths=edgePathMap(flow);
 assert.equal(paths.get('L_A_A_0'),0);assert.equal(paths.get('L_A_A_2'),2);assert.equal(paths.get('L_A_A_3'),3);assert.equal(paths.get('L_A_B_0'),1);
 assert.equal(paths.has('A-cyclic-special-1'),false);
 const single=edgePathMap(parsed('flowchart TD\nA --> A\n'));
 for(const id of ['L_A_A_0','A-cyclic-special-1','A-cyclic-special-mid','A-cyclic-special-2'])assert.equal(single.get(id),0);
});
test('la etiqueta de una conexión sigue reconocible al partirse en varias líneas SVG',()=>{
 assert.equal(sameEdgeLabel('Convertir a .elpx en casode no serlo','Convertir a .elpx en caso de no serlo'),true);
 assert.equal(sameEdgeLabel('Convertir a .elpx','Revisar el archivo'),false);
});
