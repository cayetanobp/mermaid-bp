import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
test('el encabezado cabe en el campo de BookStack y funciona con CSP strict-dynamic',async({page})=>{
 const header=await readFile(new URL('../plugins/bookstack/public/bookstack-header.html',import.meta.url),'utf8');expect(Buffer.byteLength(header)).toBeLessThan(60000);expect(header.trim()).toMatch(/<\/script>$/);
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('https://cdn.jsdelivr.net/npm/mermaid@11.17.2/dist/**',async route=>{
  const relative=new URL(route.request().url()).pathname.split('/dist/')[1];if(!relative||relative.split('/').includes('..'))return route.abort();
  await route.fulfill({contentType:'text/javascript',headers:{'access-control-allow-origin':'*'},body:await readFile(new URL('../node_modules/mermaid/dist/'+relative,import.meta.url))});
 });
 const source='%% mermaid-bp:manual-layout\nflowchart TD\nsubgraph G[Grupo]\nA[Origen] -->|Continuar| B[Destino]\nend\nB -->|Repetir| B\n%% graph:positions {"A":{"x":100,"y":100},"B":{"x":380,"y":260}}\n%% graph:groups {"G":{"x":20,"y":20,"width":500,"height":340}}\n%% graph:connections {"B>B#0":{"bendFrom":{"x":-130,"y":80},"bendTo":{"x":140,"y":80}}}';
 const escape=(text:string)=>text.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
 await page.route('**/header-verificado.html',route=>route.fulfill({contentType:'text/html',headers:{'content-security-policy':"script-src 'nonce-prueba-header' 'strict-dynamic'; style-src 'unsafe-inline';"},body:'<!doctype html><html><head><meta charset="utf-8">'+header.replace('<script type="module">','<script type="module" nonce="prueba-header">')+'</head><body><pre><code class="language-mermaid">'+escape(source)+'</code></pre><pre><code class="language-mermaid">sequenceDiagram\nAlice->>Bob: hola</code></pre></body></html>'}));
 await page.goto('/header-verificado.html');await expect(page.locator('.mbp-diagram svg')).toHaveCount(1);await expect(page.locator('pre > code.language-mermaid')).toHaveCount(1);await expect(page.locator('.mbp-diagram-error')).toHaveCount(0);
 const centers=await page.locator('.mbp-diagram svg').evaluate((root:SVGSVGElement)=>[...root.querySelectorAll<SVGGElement>('g.node')].map(node=>{const b=node.getBBox(),m=root.getCTM()!.inverse().multiply(node.getCTM()!),p=new DOMPoint(b.x+b.width/2,b.y+b.height/2).matrixTransform(m);return {x:p.x,y:p.y};}));expect(centers[0].x).toBeCloseTo(100,2);expect(centers[0].y).toBeCloseTo(100,2);expect(centers[1].x).toBeCloseTo(380,2);expect(centers[1].y).toBeCloseTo(260,2);expect(errors).toEqual([]);
});

for(const withManual of [false,true])test(`el header deja intactos los bloques sin etiqueta y la configuración habitual, manual=${withManual}`,async({page})=>{
 const header=await readFile(new URL('../dist/bookstack-header.html',import.meta.url),'utf8');
 await page.route('https://cdn.jsdelivr.net/npm/mermaid@11.17.2/dist/**',async route=>{
  const relative=new URL(route.request().url()).pathname.split('/dist/')[1];if(!relative||relative.split('/').includes('..'))return route.abort();
  await route.fulfill({contentType:'text/javascript',headers:{'access-control-allow-origin':'*'},body:await readFile(new URL('../node_modules/mermaid/dist/'+relative,import.meta.url))});
 });
 const samples=['timeline\n title Etapas\n 2024 : Inicio\n 2025 : Desarrollo','gantt\n dateFormat YYYY-MM-DD\n section Fases\n Análisis : a1,2026-01-01,5d','sequenceDiagram\nAlice->>Bob: hola','flowchart TD\nA --> B\n%% graph:positions {"A":{"x":-999,"y":999}}'];
 const escape=(s:string)=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
 const blocks=samples.map((s,i)=>`<pre id="normal-${i}"><code class="language-mermaid">${escape(s)}</code></pre>`).join('');
 const native=`<script type="module">import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11.17.2/dist/mermaid.esm.min.mjs';mermaid.initialize({startOnLoad:false,htmlLabels:true,theme:'neutral'});window.nativeMermaid=mermaid;window.originalConfig=JSON.stringify(mermaid.mermaidAPI.getSiteConfig());window.originalBlocks=[...document.querySelectorAll('pre')];</script>`;
 await page.route('**/header-scoped.html',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta charset="utf-8"></head><body>'+blocks+(withManual?'<pre><code class="language-mermaid">%% mermaid-bp:manual-layout\nflowchart TD\nX --> Y</code></pre>':'')+native+header+'</body></html>'}));
 await page.goto('/header-scoped.html');
 if(withManual)await expect(page.locator('.mbp-diagram svg')).toHaveCount(1);
 else await expect.poll(()=>page.evaluate(()=>!!(window as any).nativeMermaid)).toBe(true);
 expect(await page.evaluate(()=>{const w=window as any;return w.originalBlocks.slice(0,4).every((el:Element,i:number)=>document.getElementById('normal-'+i)===el);})).toBe(true);
 expect(await page.evaluate(()=>JSON.stringify((window as any).nativeMermaid.mermaidAPI.getSiteConfig())===(window as any).originalConfig)).toBe(true);
 await expect(page.locator('.mbp-diagram-error')).toHaveCount(0);
 await page.evaluate(async()=>{for(const pre of document.querySelectorAll<HTMLElement>('pre[id^="normal-"]')){const div=document.createElement('div');div.className='native-mermaid';div.textContent=pre.textContent;pre.replaceWith(div);await (window as any).nativeMermaid.run({nodes:[div]});}});
 await expect(page.locator('.native-mermaid svg')).toHaveCount(4);
});
