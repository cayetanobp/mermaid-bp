import {spawnSync} from 'node:child_process';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
if(process.platform!=='linux')throw Error('La comprobación reproducible de avisos Rust se ejecuta en Linux. En Windows usa scripts/audit-windows-docker.ps1.');
const temporary=await mkdtemp(join(tmpdir(),'mermaid-bp-rust-notices-'));
try{
  const metadata=spawnSync('cargo',['metadata','--locked','--format-version','1','--filter-platform','x86_64-pc-windows-msvc','--features','tauri/custom-protocol,tauri/protocol-asset','--manifest-path',join(root,'desktop-app/src-tauri/Cargo.toml')],
    {cwd:root,encoding:'utf8',maxBuffer:16*1024*1024});
  if(metadata.error||metadata.status!==0)throw Error(`Cargo metadata falló: ${metadata.error?.message??metadata.stderr}`);
  const input=join(temporary,'metadata.json'),output=join(temporary,'notices.md');
  await writeFile(input,metadata.stdout);
  const generated=spawnSync(process.execPath,[fileURLToPath(new URL('./write-rust-third-party-notices.mjs',import.meta.url)),input,output],
    {cwd:root,encoding:'utf8',maxBuffer:16*1024*1024});
  if(generated.error||generated.status!==0)throw Error(`Generación de avisos falló: ${generated.error?.message??generated.stderr}`);
  const actual=await readFile(output),committed=await readFile(resolve(root,'THIRD_PARTY_RUST_NOTICES.md'));
  if(!actual.equals(committed))throw Error('THIRD_PARTY_RUST_NOTICES.md no coincide con Cargo.lock. Regenera el archivo y revisa el cambio antes de distribuir.');
  process.stdout.write('Avisos Rust coinciden con Cargo.lock.\n');
}finally{
  await rm(temporary,{recursive:true,force:true});
}
