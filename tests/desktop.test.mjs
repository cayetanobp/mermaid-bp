import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {inspectBetaChannel} from '../scripts/validate-beta-channel.mjs';
import {validateBetaVersionTagRefs} from '../scripts/validate-beta-version-tag.mjs';
import {validateLinuxUpdaterAssetNames} from '../scripts/validate-linux-updater-asset.mjs';
import {normalizeReleaseAssetName} from '../scripts/normalize-release-asset-name.mjs';
import {prepareBetaReleaseAssets} from '../scripts/prepare-beta-release-assets.mjs';

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
test('el manifiesto del canal beta publica artefactos firmados de Windows y Debian con notas de release',async()=>{
  const folder=await mkdtemp(join(tmpdir(),'mermaid-bp-updater-'));
  try{
    const notes=join(folder,'RELEASE.md'),signature=join(folder,'installer.exe.sig'),linuxSignature=join(folder,'package.deb.sig'),output=join(folder,'latest.json');
    const signedFixture=await readFile('tests/fixtures/updater-signature-sample.txt.sig','utf8');
    await writeFile(notes,'Mejoras de esta versión.\n');
    await writeFile(signature,signedFixture);
    await writeFile(linuxSignature,signedFixture);
    // The fixture checks signature serialization; production publishes Tauri NSIS and Debian artifacts.
    const generated=spawnSync(process.execPath,['scripts/create-updater-manifest.mjs','--version','1.0.0-beta.1','--notes-file',notes,'--artifact-url','https://github.com/cayetanobp/mermaid-bp/releases/download/1.0.0-beta.1/Mermaid.BP_1.0.0-beta.1_x64-setup.exe','--signature-file',signature,'--linux-artifact-url','https://github.com/cayetanobp/mermaid-bp/releases/download/1.0.0-beta.1/Mermaid.BP_1.0.0-beta.1_amd64.deb','--linux-signature-file',linuxSignature,'--output',output],{encoding:'utf8'});
    assert.equal(generated.status,0,generated.stderr);
    const manifest=JSON.parse(await readFile(output,'utf8'));
    assert.match(Buffer.from(manifest.platforms['windows-x86_64'].signature,'base64').toString('utf8'),/trusted comment: timestamp:.*version:1\.0\.0-beta\.1/);
    assert.equal(manifest.version,'1.0.0-beta.1');
    assert.equal(manifest.notes,'Mejoras de esta versión.');
    assert.match(manifest.pub_date,/^\d{4}-\d\d-\d\dT/);
    assert.deepEqual(manifest.platforms['windows-x86_64'],{
      signature:signedFixture.trim(),
      url:'https://github.com/cayetanobp/mermaid-bp/releases/download/1.0.0-beta.1/Mermaid.BP_1.0.0-beta.1_x64-setup.exe',
    });
    assert.deepEqual(manifest.platforms['linux-x86_64-deb'],{
      signature:signedFixture.trim(),
      url:'https://github.com/cayetanobp/mermaid-bp/releases/download/1.0.0-beta.1/Mermaid.BP_1.0.0-beta.1_amd64.deb',
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
    args[6]='https://github.com/cayetanobp/mermaid-bp/releases/download/beta/installer.exe';
    const partialLinux=[...args.slice(0,-2),'--linux-artifact-url','https://github.com/cayetanobp/mermaid-bp/releases/download/beta/package.deb','--output',output];
    const missingLinuxSignature=spawnSync(process.execPath,partialLinux,{encoding:'utf8'});
    assert.notEqual(missingLinuxSignature.status,0);
    assert.match(missingLinuxSignature.stderr,/deben especificarse juntos/);
  }finally{await rm(folder,{recursive:true,force:true});}
});

test('el artefacto Linux declara el paquete Debian y la versión beta publicada',async()=>{
  const config=JSON.parse(await readFile('desktop-app/src-tauri/tauri.conf.json','utf8'));
  const packageJson=JSON.parse(await readFile('desktop-app/package.json','utf8'));
  const corePackage=JSON.parse(await readFile('package.json','utf8'));
  const coreLock=JSON.parse(await readFile('package-lock.json','utf8'));
  const cargo=await readFile('desktop-app/src-tauri/Cargo.toml','utf8');
  assert.equal(config.version,'1.0.0-beta.1');
  assert.equal(packageJson.version,'1.0.0-beta.1');
  assert.equal(corePackage.version,config.version);
  assert.equal(coreLock.version,config.version);
  assert.equal(coreLock.packages[''].version,config.version);
  assert.match(cargo,/version = "1\.0\.0-beta\.1"/);
  assert.ok(config.bundle.targets.includes('deb'));
  assert.ok(config.bundle.createUpdaterArtifacts);
  assert.ok(config.plugins.updater.pubkey.length>0);
  assert.equal(config.plugins.updater.requireSignedVersion,true);
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
test('el flujo Linux publica el Debian firmado y prueba su actualización instalada',async()=>{
  const workflow=await readFile('.github/workflows/desktop-linux.yml','utf8');
  const smoke=await readFile('scripts/smoke-linux-installed.sh','utf8');
  const updaterE2E=await readFile('scripts/linux-updater-e2e.sh','utf8');
  const docker=await readFile('scripts/build-linux-deb-docker.ps1','utf8');
  assert.match(workflow,/createUpdaterArtifacts": True/);
  assert.match(workflow,/name: mermaid-bp-linux-deb-ci/);
  assert.match(workflow,/name: mermaid-bp-linux-updater-ci/);
  assert.match(workflow,/linux-production:[\s\S]*environment: release-signing/);
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
  assert.match(workflow,/scripts\/linux-updater-e2e\.sh/);
  assert.ok(updaterE2E.includes('candidate="$(find_deb_for_version "$candidate_version")"'));
  assert.ok(updaterE2E.includes('dpkg-deb -f "$path" Package'));
  assert.ok(updaterE2E.includes('base64.b64encode'));
  assert.ok(updaterE2E.includes('d.find_element(By.ID,"plugins-close").click()'));
  assert.ok(updaterE2E.includes('exec sudo -n "$@"'));
  assert.ok(updaterE2E.includes('[[ $# -eq 3 && "$1" == "dpkg" && "$2" == "-i" ]]'));
  assert.match(workflow,/name: mermaid-bp-linux-updater/);
  assert.match(workflow,/TAURI_SIGNING_PRIVATE_KEY/);
  assert.ok(!smoke.includes('\r'));
  assert.match(smoke,/tauri-driver/);
  assert.match(smoke,/xdotool/);
  assert.match(smoke,/\.mmd/);
  assert.match(smoke,/\.svg/);
  assert.match(docker,/docker run/);
  assert.match(docker,/--mount/);
  assert.match(docker,/source=mermaid-bp-cargo-target,target=\/cargo-target/);
  assert.match(docker,/-e CARGO_TARGET_DIR=\/cargo-target/);
  assert.match(docker,/target\/linux-bundle\/deb/);
  assert.match(docker,/Write-Output "Debian package output: \$target"/);
});

test('la publicación beta exige y adjunta el paquete Debian de la misma compilación',async()=>{
  const workflow=await readFile('.github/workflows/publish-beta.yml','utf8');
  assert.match(workflow,/linux_build_run_id:/);
  assert.match(workflow,/LINUX_BUILD_RUN_ID/);
  assert.match(workflow,/mermaid-bp-linux-updater/);
  assert.match(workflow,/linux-artifact-url/);
  assert.match(workflow,/linuxSignaturePath/);
  assert.match(workflow,/coreLock\['packages'\]\[''\]\['version'\]/);
  assert.match(workflow,/validate-beta-channel\.mjs/);
  assert.doesNotMatch(workflow,/gh issue list/);
  assert.match(workflow,/cancel-in-progress: false/);
  const releaseNotes=await readFile('desktop-app/RELEASE.md','utf8');
  assert.match(releaseNotes,/mermaid-bp-plugins\/releases/);
  assert.match(releaseNotes,/Seleccionar carpeta/);
});

test('la política del canal beta solo permite actualizar su manifiesto propietario',()=>{
  const tag=[{ref:'refs/tags/beta'}];
  const ownRelease={tag_name:'beta',name:'Canal beta de Mermaid BP',draft:false,prerelease:true,assets:[{name:'latest.json'}]};
  assert.equal(inspectBetaChannel([],[]),'empty');
  assert.equal(inspectBetaChannel([{...ownRelease,assets:[]}],tag),'owned-empty');
  assert.equal(inspectBetaChannel([ownRelease],tag),'owned-with-manifest');
  assert.equal(inspectBetaChannel([ownRelease],[tag]),'owned-with-manifest');
  assert.throws(()=>inspectBetaChannel([],tag),/sin una release propietaria/);
  assert.throws(()=>inspectBetaChannel([{...ownRelease,name:'Release estable'}],tag),/no pertenece/);
  assert.throws(()=>inspectBetaChannel([{...ownRelease,prerelease:false}],tag),/no pertenece/);
  assert.throws(()=>inspectBetaChannel([{...ownRelease,assets:[{name:'latest.json'},{name:'installer.exe'}]}],tag),/assets ajenos/);
});

test('la etiqueta beta exacta debe estar libre y no confunde versiones con el mismo prefijo',()=>{
  assert.equal(validateBetaVersionTagRefs([[{ref:'refs/tags/1.0.0-beta.10'}]],'1.0.0-beta.1'),'available');
  assert.equal(validateBetaVersionTagRefs([[]],'1.0.0-beta.1'),'available');
  assert.throws(()=>validateBetaVersionTagRefs([[{ref:'refs/tags/1.0.0-beta.1'}]],'1.0.0-beta.1'),/Ya existe una etiqueta/);
});

test('la selección del paquete Debian usa el nombre real de Tauri y rechaza otras versiones o arquitecturas',()=>{
  assert.equal(validateLinuxUpdaterAssetNames(['Mermaid BP_1.0.0-beta.1_amd64.deb'],{
    productName:'Mermaid BP',version:'1.0.0-beta.1',architecture:'amd64',
  }),'Mermaid BP_1.0.0-beta.1_amd64.deb');
  assert.throws(()=>validateLinuxUpdaterAssetNames(['Mermaid BP_1.0.0-beta.2_amd64.deb'],{
    productName:'Mermaid BP',version:'1.0.0-beta.1',architecture:'amd64',
  }),/1\.0\.0-beta\.1/);
  assert.throws(()=>validateLinuxUpdaterAssetNames(['Mermaid BP_1.0.0-beta.1_arm64.deb'],{
    productName:'Mermaid BP',version:'1.0.0-beta.1',architecture:'amd64',
  }),/amd64/);
});

test('los assets de Tauri se preparan byte a byte con SHA, firma, URL y nombres publicados por GitHub',async()=>{
  const folder=await mkdtemp(join(tmpdir(),'mermaid-bp-release-assets-'));
  try{
    const windowsFile=join(folder,'Mermaid BP_1.0.0-beta.1_x64-setup.exe');
    const windowsSignature=join(folder,'Mermaid BP_1.0.0-beta.1_x64-setup.exe.sig');
    const linuxFile=join(folder,'Mermaid BP_1.0.0-beta.1_amd64.deb');
    const linuxSignature=join(folder,'Mermaid BP_1.0.0-beta.1_amd64.deb.sig');
    const outputDirectory=join(folder,'staged');
    const signature=await readFile('tests/fixtures/updater-signature-sample.txt.sig');
    await writeFile(windowsFile,Buffer.from('windows release bytes'));
    await writeFile(windowsSignature,signature);
    await writeFile(linuxFile,Buffer.from('debian release bytes'));
    await writeFile(linuxSignature,signature);
    const prepared=await prepareBetaReleaseAssets({windowsFile,windowsSignature,linuxFile,linuxSignature,outputDirectory});
    for(const [source,asset] of [[windowsFile,prepared.windows],[linuxFile,prepared.linux]]){
      assert.deepEqual(await readFile(source),await readFile(asset.path));
      assert.deepEqual(await readFile(source+'.sig'),await readFile(asset.signaturePath));
      const digest=createHash('sha256').update(await readFile(asset.path)).digest('hex');
      assert.equal(asset.sha256,digest);
      assert.equal(await readFile(asset.checksumPath,'utf8'),`${digest}  ${asset.name}`);
    }
    assert.equal(prepared.windows.name,'Mermaid.BP_1.0.0-beta.1_x64-setup.exe');
    assert.equal(prepared.linux.name,'Mermaid.BP_1.0.0-beta.1_amd64.deb');
    const notes=join(folder,'RELEASE.md'),manifestPath=join(folder,'latest.json');
    await writeFile(notes,'Notas de release.');
    const base='https://github.com/cayetanobp/mermaid-bp/releases/download/1.0.0-beta.1/';
    const generated=spawnSync(process.execPath,['scripts/create-updater-manifest.mjs','--version','1.0.0-beta.1','--notes-file',notes,'--artifact-url',base+prepared.windows.name,'--signature-file',prepared.windows.signaturePath,'--linux-artifact-url',base+prepared.linux.name,'--linux-signature-file',prepared.linux.signaturePath,'--output',manifestPath],{encoding:'utf8'});
    assert.equal(generated.status,0,generated.stderr);
    const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
    assert.equal(manifest.platforms['windows-x86_64'].url,base+'Mermaid.BP_1.0.0-beta.1_x64-setup.exe');
    assert.equal(manifest.platforms['linux-x86_64-deb'].url,base+'Mermaid.BP_1.0.0-beta.1_amd64.deb');
    assert.equal(manifest.platforms['windows-x86_64'].signature,(await readFile(prepared.windows.signaturePath,'utf8')).trim());
    assert.equal(manifest.platforms['linux-x86_64-deb'].signature,(await readFile(prepared.linux.signaturePath,'utf8')).trim());
  }finally{await rm(folder,{recursive:true,force:true});}
});

test('la normalización de nombres de assets rechaza rutas y caracteres incompatibles con GitHub',()=>{
  const windows=normalizeReleaseAssetName('Mermaid BP_1.0.0-beta.1_x64-setup.exe');
  const linux=normalizeReleaseAssetName('Mermaid BP_1.0.0-beta.1_amd64.deb');
  assert.equal(windows,'Mermaid.BP_1.0.0-beta.1_x64-setup.exe');
  assert.equal(linux,'Mermaid.BP_1.0.0-beta.1_amd64.deb');
  assert.throws(()=>normalizeReleaseAssetName('../Mermaid BP.deb'),/nombre de archivo simple/);
  assert.throws(()=>normalizeReleaseAssetName('Mermaid BP_1.0.0-beta.1_amd64.deb?download=1'),/no seguros/);
});

test('una reejecución de publicación rechaza el tag exacto ya existente',()=>{
  assert.throws(()=>validateBetaVersionTagRefs([[{ref:'refs/tags/1.0.0-beta.1'}]],'1.0.0-beta.1'),/Ya existe una etiqueta/);
});
