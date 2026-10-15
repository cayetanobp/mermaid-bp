import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assertSourceSafe,readMmdFile,MAX_SOURCE_BYTES} from '../src/source-security.ts';
test('acepta Mermaid declarativo con estilos locales y configuración de distribución',()=>{
 assert.doesNotThrow(()=>assertSourceSafe('%%{init: {"flowchart":{"nodeSpacing":60,"rankSpacing":80}}}%%\nflowchart TD\nA["Expediente"]-->B["Resolución"]\nstyle A fill:#fff,stroke:#333'));
});
for(const source of ['<html><script>alert(1)</script></html>','flowchart TD\nA["<img src=x onerror=alert(1)>"]','flowchart TD\nclick A callback','%%{init:{"securityLevel":"loose"}}%%\nflowchart TD\nA-->B','flowchart TD\nclassDef p fill:red;}body{color:red','flowchart TD\nstyle A fill:u\\72l(https://example.invalid)','---\nconfig:\n securityLevel: loose\n---\nflowchart TD','flowchart TD\nA\u0000B','flowchart TD\n%% graph:positions {"__proto__":{"x":1}}','flowchart TD\n%% graph:positions {"A":{"x":1e999}}'])test('rechaza entrada activa o configuración no permitida '+source.slice(0,35),()=>assert.throws(()=>assertSourceSafe(source)));
test('archivo solo .mmd y UTF-8, con límite real de bytes',async()=>{
 await assert.rejects(readMmdFile(new File(['flowchart TD\nA-->B'],'dato.txt')));
 await assert.rejects(readMmdFile(new File(['flowchart TD\nA-->B'],'dato.mmd.exe')));
 await assert.rejects(readMmdFile(new File([new Uint8Array([255,254,0])],'dato.mmd')));
 await assert.rejects(readMmdFile(new File(['x'.repeat(MAX_SOURCE_BYTES+1)],'dato.mmd')));
 assert.equal(await readMmdFile(new File(['flowchart TD\nA-->B'],'dato.MMD')),'flowchart TD\nA-->B');
});
