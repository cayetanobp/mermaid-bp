import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readPositions, writePositions, hasManualLayout, tagManualLayout, manualLayoutTag } from '../src/positions.ts';
import { parseFlow, serializeFlow } from '../src/flow.ts';
test('guardar posiciones conserva el Mermaid y CRLF, y no acumula comentarios', () => {
  const source = 'flowchart TD\r\nA --> B\r\n%% comentario\r\n';
  const saved = writePositions(source, { A: { x: -32.12345, y: 75 } });
  assert.ok(saved.startsWith(manualLayoutTag + '\r\n' + source));
  assert.ok(hasManualLayout(saved));
  assert.deepEqual({ ...readPositions(saved) }, { A: { x: -32.12345, y: 75 } });
  const twice = writePositions(saved, { A: { x: 10, y: 20 } });
  assert.equal(twice.match(/%% graph:positions/g)?.length, 1);
  assert.ok(!twice.replaceAll('\r\n', '').includes('\n'));
});
test('los metadatos incompletos o coordenadas no finitas no bloquean el documento', () => {
  assert.deepEqual({ ...readPositions('%% graph:positions {') }, {});
  assert.deepEqual({ ...readPositions('%% graph:positions {"a":{"x":"1","y":0},"b":{"x":1e99,"y":1},"ok":{"x":1,"y":2}}') }, { ok: { x: 1, y: 2 } });
});
test('una edición visual de texto conserva el comentario de posiciones', () => {
  const source = writePositions('flowchart TD\nA["uno"] --> B\n', { A: { x: 4, y: 9 }, B: { x: 100, y: 80 } });
  const parsed = parseFlow(source); assert.ok(parsed.ok);
  parsed.flow.nodes[0].label = 'actualizado';
  const output = serializeFlow(parsed.flow);
  assert.deepEqual(readPositions(output), readPositions(source));
  assert.ok(output.includes('actualizado'));
});

test('solo la etiqueta superior activa posiciones y no se duplica', () => {
  assert.equal(hasManualLayout('flowchart TD\nA --> B\n%% graph:positions {"A":{"x":1,"y":2}}'), false);
  assert.equal(hasManualLayout('flowchart TD\n%% mermaid-bp:manual-layout'), false);
  const tagged = tagManualLayout('flowchart TD\nA --> B');
  assert.equal(hasManualLayout(tagged), true);
  assert.equal(tagManualLayout(tagged), tagged);
});

import {readGroups,writeGroups} from '../src/groups.ts';
test('los fondos guardan límites finitos, conservan CRLF y sobreviven a la edición visual',()=>{
  const box={x:-20,y:35,width:160,height:90};
  const saved=writeGroups('flowchart TD\r\nsubgraph G[Grupo]\r\nA[Uno]\r\nend\r\n',{G:box});
  assert.deepEqual({...readGroups(saved)},{G:box});
  assert.ok(!saved.replaceAll('\r\n','').includes('\n'));
  const updated=writeGroups(saved,{G:{...box,width:180}});
  assert.equal(updated.match(/%% graph:groups/g)?.length,1);
  const parsed=parseFlow(updated);assert.ok(parsed.ok);parsed.flow.nodes[0].label='Dos';
  assert.deepEqual(readGroups(serializeFlow(parsed.flow)),readGroups(updated));
  assert.deepEqual({...readGroups('%% graph:groups {"bad":{"x":0,"y":0,"width":-1,"height":80},"huge":{"x":1e99,"y":0,"width":80,"height":80}}')},{});
  assert.deepEqual({...readGroups('%% graph:groups {')},{});
});

import {assignGroup,saveGroup,deleteGroup,groupPath} from '../src/subgroups.ts';
test('crear, renombrar, anidar, asignar y eliminar subgrupos conserva los nodos, estilos y relaciones',()=>{
  const source='%% mermaid-bp:manual-layout\r\n%%{init: {"flowchart":{"htmlLabels":true}}}%%\r\nflowchart TD\r\nsubgraph G["Original"]\r\n A[Uno] --> B[Dos]\r\nend\r\nC[Tres]\r\nstyle G fill:#ffddaa\r\nclassDef destacado fill:#eee\r\nclass A destacado\r\n%% graph:positions {"A":{"x":10,"y":30}}\r\n';
  const parsed=parseFlow(source);assert.ok(parsed.ok);const f=parsed.flow;
  saveGroup(f,{id:'G',label:'Renombrado'});
  saveGroup(f,{id:'H',label:'Interior',parent:'G'});
  assignGroup(f,'A','H');assignGroup(f,'C','G');assignGroup(f,'B','');
  const output=serializeFlow(f),again=parseFlow(output);assert.ok(again.ok);
  assert.equal(again.flow.nodes.find(n=>n.id==='A')?.group,'G/H');
  assert.equal(again.flow.nodes.find(n=>n.id==='C')?.group,'G');
  assert.equal(again.flow.nodes.find(n=>n.id==='B')?.group,undefined);
  assert.equal(again.flow.edges.length,1);assert.ok(output.includes('fill:#ffddaa'));assert.ok(output.includes('class A destacado'));
  assert.ok(output.includes('%%{init:'));assert.deepEqual(readPositions(output),readPositions(source));
  assert.ok(!output.replaceAll('\r\n','').includes('\n'));
  assert.throws(()=>saveGroup(again.flow,{id:'G',label:'Ciclo',parent:'H'}));
  deleteGroup(again.flow,'G');
  const final=parseFlow(serializeFlow(again.flow));assert.ok(final.ok);
  assert.equal(groupPath(final.flow,'H'),'H');assert.equal(final.flow.nodes.find(n=>n.id==='A')?.group,'H');
  assert.equal(final.flow.nodes.find(n=>n.id==='C')?.group,undefined);
  assert.equal(final.flow.nodes.length,3);assert.equal(final.flow.edges.length,1);
});

import {resetLayout} from '../src/reset-layout.ts';
test('recolocar conserva contenido y estilos, respeta CRLF y elimina solo distribución del editor',()=>{
 const original='%% mermaid-bp:manual-layout\r\n%% comentario\r\n%%{init: {"flowchart":{"nodeSpacing":60}}}%%\r\nflowchart LR\r\nA --> B\r\nclassDef base fill:#eee\r\n%% graph:positions {"A":{"x":1,"y":2}}\r\n%% graph:groups {}\r\n%% graph:connections {}\r\n%% mbp-layout:start\r\nA ~~~ B\r\n%% mbp-layout:end\r\n';
 const reset=resetLayout(original);
 assert.ok(reset.startsWith('%% comentario\r\n%%{init:'));
 assert.ok(reset.includes('A --> B'));assert.ok(reset.includes('classDef base fill:#eee'));
 assert.ok(!reset.includes('graph:'));assert.ok(!reset.includes('mbp-layout'));assert.ok(!reset.includes('~~~'));
 assert.ok(!reset.replaceAll('\r\n','').includes('\n'));assert.equal(resetLayout(reset),reset);
});
