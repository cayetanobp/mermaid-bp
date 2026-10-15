import {test}from'node:test';import assert from'node:assert/strict';
import{readConnections,writeConnections,connectionKey}from'../src/connections.ts';
import{roundedPath,anchor}from'../src/routes.ts';
test('anclajes se guardan en Mermaid etiquetado y se normalizan sin duplicarse',()=>{
const source=writeConnections('flowchart TD\nA --> B\n',{'A>B#0':{from:45,to:270}});
assert.ok(source.startsWith('%% mermaid-bp:manual-layout\n'));assert.deepEqual({...readConnections(source)},{'A>B#0':{from:45,to:270}});
assert.equal(writeConnections(source,{}).match(/%% graph:connections/g)?.length,1);
assert.deepEqual({...readConnections('%% graph:connections {"a":{"from":-90,"to":720},"b":{"from":"x"}}')},{a:{from:270,to:0}});
});
test('conexiones paralelas tienen anclajes distintos y los bucles conservan su clave',()=>{const edges=[{from:'A',to:'B'},{from:'A',to:'A'},{from:'A',to:'B'}];assert.equal(connectionKey(edges,2),'A>B#1');assert.equal(connectionKey(edges,1),'A>A#0');});
test('curvas suaves y anclajes quedan en los límites de rectángulos, círculos y rombos',()=>{
assert.ok(roundedPath([{x:0,y:0},{x:0,y:100},{x:100,y:100}]).includes(' Q'));
assert.ok(!roundedPath([{x:0,y:0},{x:0,y:0},{x:2,y:3}]).includes('NaN'));
assert.deepEqual(anchor({x:0,y:0},100,50,'rect',0),{x:50,y:0});
const diamond=anchor({x:0,y:0},100,100,'diamond',45);assert.ok(Math.abs(diamond.x-25)<1e-10);assert.ok(Math.abs(diamond.y-25)<1e-10);
});

test("los dos vectores Bézier se conservan y se rechazan coordenadas inválidas",()=>{const input={'A>B#0':{from:20,bendFrom:{x:40,y:-100},bendTo:{x:-50,y:120}}};assert.deepEqual({...readConnections(writeConnections('flowchart TD\nA-->B\n',input))},input);assert.deepEqual({...readConnections('%% graph:connections {"x":{"bendFrom":{"x":"a","y":0}}}')},{});});
