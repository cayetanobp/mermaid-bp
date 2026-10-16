import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {join,resolve,relative,isAbsolute} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {unzipSync,strFromU8} from 'fflate';
import {packageWeb} from '../scripts/package-web.mjs';

test('el paquete contiene web y plugins, configuración de Nginx y checksum, sin fuentes privadas',async()=>{
 const root=await mkdtemp(join(tmpdir(),'mermaid-bp-package-'));
 try{
  for(const dir of ['dist/assets','dist/plugins/mod','deploy/nginx','docs','src'])await mkdir(join(root,dir),{recursive:true});
  for(const [file,body]of Object.entries({'LICENSE':'GNU AFFERO GENERAL PUBLIC LICENSE\nVersion 3','NOTICE.md':'Copyright (C) 2026 cayetanobp.','dist/index.html':'<script src="./assets/app.js"></script>','dist/assets/app.js':'export const app=true;','dist/plugins/mod/index.js':'export default {};','deploy/nginx/mermaid-bp.conf':'server {}','deploy/nginx/mermaid-bp-static.conf':'autoindex_format json;','docs/nginx.md':'Guía de instalación','src/private.ts':'no publicar','.env':'no publicar'}))await writeFile(join(root,file),body);
  const result=await packageWeb(root),bytes=await readFile(result.file),files=unzipSync(bytes);
  assert.deepEqual(Object.keys(files).sort(),['LEEME.md','nginx/mermaid-bp-static.conf','nginx/mermaid-bp.conf','site/LICENSE','site/NOTICE.md','site/assets/app.js','site/index.html','site/plugins/mod/index.js']);
  assert.match(strFromU8(files['site/LICENSE']),/GNU AFFERO GENERAL PUBLIC LICENSE/);
  assert.match(strFromU8(files['site/NOTICE.md']),/cayetanobp/);
  assert.equal(strFromU8(files['site/plugins/mod/index.js']),'export default {};');
  assert.equal(await readFile(result.file+'.sha256','utf8'),createHash('sha256').update(bytes).digest('hex')+'  mermaid-bp-web.zip\n');
  assert.equal(strFromU8(files['LEEME.md']),'Guía de instalación');
 }finally{
  const target=resolve(root),rel=relative(resolve(tmpdir()),target);assert.ok(rel&&!rel.startsWith('..')&&!isAbsolute(rel));await rm(target,{recursive:true,force:true});
 }
});
