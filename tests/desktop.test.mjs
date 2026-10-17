import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
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
  window.open('/plugins/example/preview.html#draft');
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls[1][0],'open_preview');
  assert.equal(calls[1][1].url,'http://tauri.localhost/plugins/example/preview.html#draft');
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
  assert.ok(entries.every(entry=>entry.name!=='bookstack'));
  for(const entry of entries){
    const folder=root+'plugins/'+entry.name+'/';
    const manifest=JSON.parse(await readFile(folder+'plugin.json','utf8'));
    assert.equal(manifest.id,entry.name);
    await access(folder+(manifest.entry??'index.js'));
  }
  await assert.rejects(access(root+'plugins/bookstack/bookstack.html'));
});

test('el manifiesto del canal beta publica el artefacto firmado de Windows y las notas de release',async()=>{
  const folder=await mkdtemp(join(tmpdir(),'mermaid-bp-updater-'));
  try{
    const notes=join(folder,'RELEASE.md'),signature=join(folder,'installer.nsis.zip.sig'),output=join(folder,'latest.json');
    const signedFixture=await readFile('tests/fixtures/updater-signature-sample.txt.sig','utf8');
    await writeFile(notes,'Mejoras de esta versión.\n');
    await writeFile(signature,signedFixture);
    const generated=spawnSync(process.execPath,['scripts/create-updater-manifest.mjs','--version','1.0.0-beta.1','--notes-file',notes,'--artifact-url','https://github.com/cayetanobp/mermaid-bp/releases/download/1.0.0-beta.1/updater-signature-sample.txt','--signature-file',signature,'--output',output],{encoding:'utf8'});
    assert.equal(generated.status,0,generated.stderr);
    const manifest=JSON.parse(await readFile(output,'utf8'));
    assert.match(Buffer.from(manifest.platforms['windows-x86_64'].signature,'base64').toString('utf8'),/trusted comment: timestamp:.*version:1\.0\.0-beta\.1/);
    assert.equal(manifest.version,'1.0.0-beta.1');
    assert.equal(manifest.notes,'Mejoras de esta versión.');
    assert.match(manifest.pub_date,/^\d{4}-\d\d-\d\dT/);
    assert.deepEqual(manifest.platforms['windows-x86_64'],{
      signature:signedFixture.trim(),
      url:'https://github.com/cayetanobp/mermaid-bp/releases/download/1.0.0-beta.1/updater-signature-sample.txt',
    });
  }finally{await rm(folder,{recursive:true,force:true});}
});

test('el manifiesto rechaza una URL HTTP o un artefacto sin firma',async()=>{
  const folder=await mkdtemp(join(tmpdir(),'mermaid-bp-updater-'));
  try{
    const notes=join(folder,'RELEASE.md'),signature=join(folder,'installer.sig'),output=join(folder,'latest.json');
    await writeFile(notes,'Notas');await writeFile(signature,'');
    const args=['scripts/create-updater-manifest.mjs','--version','1.0.0-beta.1','--notes-file',notes,'--artifact-url','http://github.com/cayetanobp/mermaid-bp/releases/download/beta/installer.zip','--signature-file',signature,'--output',output];
    const generated=spawnSync(process.execPath,args,{encoding:'utf8'});
    assert.notEqual(generated.status,0);
    assert.match(generated.stderr,/HTTPS/);
    await writeFile(signature,'');
    args[6]='https://github.com/cayetanobp/mermaid-bp/releases/download/beta/installer.zip';
    const unsigned=spawnSync(process.execPath,args,{encoding:'utf8'});
    assert.notEqual(unsigned.status,0);
    assert.match(unsigned.stderr,/firma de updater/);
  }finally{await rm(folder,{recursive:true,force:true});}
});
