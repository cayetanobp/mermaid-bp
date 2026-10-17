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
    const notes=join(folder,'RELEASE.md'),signature=join(folder,'installer.exe.sig'),output=join(folder,'latest.json');
    const signedFixture=await readFile('tests/fixtures/updater-signature-sample.txt.sig','utf8');
    await writeFile(notes,'Mejoras de esta versión.\n');
    await writeFile(signature,signedFixture);
    // The fixture checks signature serialization; production publishes the Tauri 2 NSIS executable.
    const generated=spawnSync(process.execPath,['scripts/create-updater-manifest.mjs','--version','1.0.0-beta.1','--notes-file',notes,'--artifact-url','https://github.com/cayetanobp/mermaid-bp/releases/download/1.0.0-beta.1/Mermaid-BP-setup.exe','--signature-file',signature,'--output',output],{encoding:'utf8'});
    assert.equal(generated.status,0,generated.stderr);
    const manifest=JSON.parse(await readFile(output,'utf8'));
    assert.match(Buffer.from(manifest.platforms['windows-x86_64'].signature,'base64').toString('utf8'),/trusted comment: timestamp:.*version:1\.0\.0-beta\.1/);
    assert.equal(manifest.version,'1.0.0-beta.1');
    assert.equal(manifest.notes,'Mejoras de esta versión.');
    assert.match(manifest.pub_date,/^\d{4}-\d\d-\d\dT/);
    assert.deepEqual(manifest.platforms['windows-x86_64'],{
      signature:signedFixture.trim(),
      url:'https://github.com/cayetanobp/mermaid-bp/releases/download/1.0.0-beta.1/Mermaid-BP-setup.exe',
    });
  }finally{await rm(folder,{recursive:true,force:true});}
});

test('el manifiesto rechaza una URL HTTP o un artefacto sin firma',async()=>{
  const folder=await mkdtemp(join(tmpdir(),'mermaid-bp-updater-'));
  try{
    const notes=join(folder,'RELEASE.md'),signature=join(folder,'installer.sig'),output=join(folder,'latest.json');
    await writeFile(notes,'Notas');await writeFile(signature,'');
    const args=['scripts/create-updater-manifest.mjs','--version','1.0.0-beta.1','--notes-file',notes,'--artifact-url','http://github.com/cayetanobp/mermaid-bp/releases/download/beta/installer.exe','--signature-file',signature,'--output',output];
    const generated=spawnSync(process.execPath,args,{encoding:'utf8'});
    assert.notEqual(generated.status,0);
    assert.match(generated.stderr,/HTTPS/);
    await writeFile(signature,'');
    args[6]='https://github.com/cayetanobp/mermaid-bp/releases/download/beta/installer.exe';
    const unsigned=spawnSync(process.execPath,args,{encoding:'utf8'});
    assert.notEqual(unsigned.status,0);
    assert.match(unsigned.stderr,/firma de updater/);
    await writeFile(signature,await readFile('tests/fixtures/updater-signature-sample.txt.sig','utf8'));
    args[6]='https://github.com/cayetanobp/mermaid-bp/releases/download/beta/installer.zip';
    const wrongArtifact=spawnSync(process.execPath,args,{encoding:'utf8'});
    assert.notEqual(wrongArtifact.status,0);
    assert.match(wrongArtifact.stderr,/NSIS \.exe/);
  }finally{await rm(folder,{recursive:true,force:true});}
});

test('el artefacto Linux declara el paquete Debian y la versión beta publicada',async()=>{
  const config=JSON.parse(await readFile('desktop-app/src-tauri/tauri.conf.json','utf8'));
  const packageJson=JSON.parse(await readFile('desktop-app/package.json','utf8'));
  const cargo=await readFile('desktop-app/src-tauri/Cargo.toml','utf8');
  assert.equal(config.version,'1.0.0-beta.1');
  assert.equal(packageJson.version,'1.0.0-beta.1');
  assert.match(cargo,/version = "1\.0\.0-beta\.1"/);
  assert.ok(config.bundle.targets.includes('deb'));
  assert.equal(config.productName,'Mermaid BP');
  assert.deepEqual(Array.from(config.bundle.targets),['nsis','deb']);
  assert.ok(config.bundle.linux.deb.depends.includes('libayatana-appindicator3-1'));
  await access('desktop-app/src-tauri/icons/icon.png');
});
test('el updater Windows conserva idiomas y usa selección automática compatible con instalación pasiva',async()=>{
  const config=JSON.parse(await readFile('desktop-app/src-tauri/tauri.conf.json','utf8'));
  assert.deepEqual(Array.from(config.bundle.windows.nsis.languages),['Spanish','English']);
  assert.equal(config.bundle.windows.nsis.displayLanguageSelector,false);
});
test('el flujo Linux instala el paquete y automatiza una sesión gráfica real',async()=>{
  const workflow=await readFile('.github/workflows/desktop-linux.yml','utf8');
  const smoke=await readFile('scripts/smoke-linux-installed.sh','utf8');
  const docker=await readFile('scripts/build-linux-deb-docker.ps1','utf8');
  assert.ok(workflow.includes('createUpdaterArtifacts":false'));
  assert.ok(workflow.includes('npm exec -- tauri build'));
  assert.ok(workflow.includes('-- --locked'));
  assert.match(workflow,/ubuntu-24\.04/);
  assert.match(workflow,/packages=\(desktop-app\/src-tauri\/target\/release\/bundle\/deb\/\*\.deb\)/);
  assert.match(workflow,/dpkg-deb -f "\$package" Package\)" = mermaid-bp/);
  assert.match(workflow,/dpkg-deb -f "\$package" Version\)" = 1\.0\.0-beta\.1/);
  assert.match(workflow,/dpkg-deb -f "\$package" Architecture\)" = amd64/);
  assert.match(workflow,/sudo apt-get install -y "\.\/\$\{packages\[0\]\}"/);
  assert.match(workflow,/smoke-linux-installed\.sh/);
  assert.match(workflow,/xvfb-run[^\n]*dbus-run-session -- bash -c/);
  assert.match(workflow,/bash \.\/scripts\/smoke-linux-installed\.sh/);
  assert.ok(!smoke.includes('\r'));
  assert.match(smoke,/tauri-driver/);
  assert.match(smoke,/xdotool/);
  assert.match(smoke,/\.mmd/);
  assert.match(smoke,/\.svg/);
  assert.match(smoke,/menu-archivo/);
  assert.match(smoke,/menu-archivo-panel/);
  assert.match(smoke,/is_displayed\(\)/);
  assert.equal((smoke.match(/open_file_menu\(\)/g)??[]).length,3);
  assert.match(smoke,/open_file_menu\(\)\n    mmd = out \/ "installed-smoke\.mmd"\n    save_from_native_dialog\(driver\.find_element\(By\.ID, "save"\), mmd\)/);
  assert.match(smoke,/open_file_menu\(\)\n    svg = out \/ "installed-smoke\.svg"\n    save_from_native_dialog\(driver\.find_element\(By\.ID, "svg"\), svg\)/);
  assert.match(docker,/docker run/);
  assert.match(docker,/--mount/);
  assert.match(docker,/source=mermaid-bp-cargo-target,target=\/cargo-target/);
  assert.match(docker,/-e CARGO_TARGET_DIR=\/cargo-target/);
  assert.match(docker,/target\/linux-bundle\/deb/);
  assert.match(docker,/Write-Output "Debian package output: \$target"/);
});
