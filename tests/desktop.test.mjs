import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import vm from 'node:vm';

test('el puente conserva bytes UTF-8 y comunica la cancelación sin descargar una segunda copia',async()=>{
  const calls=[],alerts=[];
  const window={__TAURI__:{core:{invoke:async(...args)=>{calls.push(args);return false;}}},alert:value=>alerts.push(value)};
  vm.runInNewContext(await readFile('desktop-app/src-tauri/src/bridge.js','utf8'),{window,Uint8Array,URL,location:{href:'http://tauri.localhost/'}});
  const blob=new Blob(['á → ñ']);
  await window.__MERMAID_BP_SAVE__(blob,'diagrama.mmd');
  assert.equal(calls[0][0],'save_document');
  assert.deepEqual(Array.from(calls[0][1].bytes),Array.from(new Uint8Array(await blob.arrayBuffer())));
  assert.equal(alerts.length,0);
  window.open('/plugins/bookstack/bookstack.html#draft');
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls[1][0],'open_preview');
  assert.equal(calls[1][1].url,'http://tauri.localhost/plugins/bookstack/bookstack.html#draft');
  window.__TAURI__.core.invoke=async()=>{throw Error('Disco lleno');};
  await window.__MERMAID_BP_SAVE__(blob,'diagrama.mmd');
  assert.match(alerts[0],/Disco lleno/);
});

test('el paquete estático permite descubrir las extensiones y resolver sus entradas sin servidor',async()=>{
  const root='desktop-app/dist/';
  assert.match(await readFile(root+'LICENSE','utf8'),/GNU AFFERO GENERAL PUBLIC LICENSE/);
  assert.match(await readFile(root+'NOTICE.md','utf8'),/AGPL-3\.0-only/);
  assert.match(await readFile(root+'THIRD_PARTY_NOTICES.md','utf8'),/@fontsource\/ibm-plex-sans/);
  assert.match(await readFile(root+'index.html','utf8'),/name="mermaid-bp-desktop"/);
  const entries=JSON.parse(await readFile(root+'plugins/index.json','utf8'));
  assert.ok(entries.some(entry=>entry.name==='bookstack'));
  for(const entry of entries){
    const folder=root+'plugins/'+entry.name+'/';
    const manifest=JSON.parse(await readFile(folder+'plugin.json','utf8'));
    assert.equal(manifest.id,entry.name);
    await access(folder+(manifest.entry??'index.js'));
  }
  await access(root+'plugins/bookstack/bookstack.html');
});
