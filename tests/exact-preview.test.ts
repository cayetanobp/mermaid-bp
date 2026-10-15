import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ExactDragPreview } from '../src/drag-preview.ts';
import { parseFlow } from '../src/flow.ts';
import type { Rendered } from '../src/render';
const source = 'flowchart TD\nA --> B\nB --> C';
const geometry = { nodes: { A: { x: 0, y: 0 }, B: { x: 0, y: 100 }, C: { x: 0, y: 200 } }, width: 200, height: 300 };
const result: Rendered = { svg: '<svg/>', geometry };
const flow = () => { const p = parseFlow(source); assert.ok(p.ok); return p.flow; };
async function waitFor(predicate: () => boolean) {
  const until = Date.now() + 2000;
  while (!predicate()) { if (Date.now() > until) assert.fail('La operación no terminó.'); await new Promise(resolve => setTimeout(resolve, 5)); }
}
test('solo calcula tras una pausa y reutiliza una propuesta ya calculada', async () => {
  let renders = 0;
  const preview = new ExactDragPreview({ flow: flow(), geometry, id: 'C', source, minimum: 8, idleMs: 15, intervalMs: 0,
    render: async () => { renders++; return result; }, onState: () => {} });
  try {
    for (let i = 0; i < 100; i++) preview.update({ x: 0, y: 300 + i / 100 });
    assert.equal(renders, 0);
    await waitFor(() => preview.status === 'ready'); assert.equal(renders, 1);
    const visible = preview.visible;
    preview.update({ x: 0, y: 301 }); await waitFor(() => preview.status === 'ready');
    assert.equal(renders, 1); assert.equal(preview.visible, visible);
  } finally { preview.stop(); }
});
test('no encola renders y descarta resultados de posiciones anteriores', async () => {
  const completions: Array<(value: Rendered) => void> = [];
  const preview = new ExactDragPreview({ flow: flow(), geometry, id: 'C', source, minimum: 8, idleMs: 5, intervalMs: 0,
    render: () => new Promise(resolve => completions.push(resolve)), onState: () => {} });
  try {
    preview.update({ x: 0, y: 300 }); await waitFor(() => completions.length === 1);
    preview.update({ x: 0, y: 420 }); preview.update({ x: 0, y: 450 });
    assert.equal(completions.length, 1); assert.equal(preview.visible, null);
    completions[0](result); await waitFor(() => completions.length === 2);
    assert.equal(preview.visible, null);
    completions[1](result); await waitFor(() => preview.status === 'ready');
    const shown = Reflect.get(preview, 'visible') as { source: string } | null;
    assert.ok(shown && /----+>/.test(shown.source));
  } finally { preview.stop(); }
});
test('detener una propuesta impide que su resultado tardío se publique', async () => {
  let complete: ((value: Rendered) => void) | undefined, published = 0;
  const preview = new ExactDragPreview({ flow: flow(), geometry, id: 'C', source, minimum: 8, idleMs: 5, intervalMs: 0,
    render: () => new Promise(resolve => { complete = resolve; }), onState: state => { if (state === 'ready') published++; } });
  preview.update({ x: 0, y: 300 }); await waitFor(() => !!complete);
  preview.stop(); complete!(result);
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(preview.visible, null); assert.equal(published, 0);
});
test('no calcula nada cuando no existe un ajuste', async () => {
  let renders = 0;
  const preview = new ExactDragPreview({ flow: flow(), geometry, id: 'C', source, minimum: 8, idleMs: 5, intervalMs: 0,
    render: async () => { renders++; return result; }, onState: () => {} });
  try { preview.update({ x: 0, y: 203 }); await waitFor(() => preview.status === 'unchanged'); assert.equal(renders, 0); }
  finally { preview.stop(); }
});
