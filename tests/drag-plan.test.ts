import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DragIndex, planDrop } from '../src/drag-plan.ts';
import { parseFlow, serializeFlow } from '../src/flow.ts';
function parsed(source: string) { const p = parseFlow(source); assert.ok(p.ok); return p.flow; }
const geometry = { nodes: { A: { x: 0, y: 0 }, B: { x: 0, y: 100 }, C: { x: 0, y: 200 } }, width: 200, height: 300 };
test('la búsqueda binaria encuentra las alineaciones sin desplazar posiciones lejanas', () => {
  const flow = parsed('flowchart TD\nA --> B\nB --> C'), index = new DragIndex(flow, geometry, 'C');
  assert.deepEqual(index.snap({ x: 5, y: 104 }, 8), { point: { x: 0, y: 100 }, guideX: 0, guideY: 100 });
  assert.deepEqual(index.snap({ x: 20, y: 140 }, 8), { point: { x: 20, y: 140 }, guideX: null, guideY: null });
});
test('al soltar se modifica una única separación sin alterar extremos ni el original', () => {
  const flow = parsed('flowchart TD\nA --> B\nB --> C'), original = serializeFlow(flow);
  const next = planDrop(flow, geometry, 'C', { x: 0, y: 320 }, new DragIndex(flow, geometry, 'C'))!;
  assert.ok(next); assert.equal(next.edges[0].arrow, '-->'); assert.equal(next.edges[1].arrow, '--->');
  assert.deepEqual(next.edges.map(e => [e.from, e.to]), flow.edges.map(e => [e.from, e.to]));
  assert.equal(serializeFlow(flow), original);
});
test('ignora microdesplazamientos y nodos aislados', () => {
  const flow = parsed('flowchart TD\nA --> B\nB --> C');
  assert.equal(planDrop(flow, geometry, 'C', { x: 0, y: 204 }, new DragIndex(flow, geometry, 'C')), null);
  const single = parsed('flowchart TD\nA');
  assert.equal(planDrop(single, geometry, 'A', { x: 100, y: 100 }, new DragIndex(single, geometry, 'A')), null);
});
test('las guías y el reordenamiento no cruzan subgráficos', () => {
  const flow = parsed('flowchart TD\nsubgraph G["grupo"]\nA\nB\nend\nC');
  const index = new DragIndex(flow, geometry, 'A');
  assert.equal(index.byX.length, 1); assert.equal(index.byX[0].id, 'B');
  assert.equal(index.snap({ x: 1, y: 199 }, 8).guideY, null);
});
test('acorta separaciones existentes al mover un nodo hacia su origen', () => {
  const flow = parsed('flowchart TD\nA --> B\nB ----> C');
  const next = planDrop(flow, geometry, 'C', { x: 0, y: 80 }, new DragIndex(flow, geometry, 'C'))!;
  assert.ok(next); assert.equal(next.edges[1].arrow, '--->');
});
