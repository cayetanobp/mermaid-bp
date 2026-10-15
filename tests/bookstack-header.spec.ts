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
 await page.goto('/header-verificado.html');await expect(page.locator('.mbp-diagram svg')).toHaveCount(1);await expect(page.locator('.mermaid:not(.mbp-diagram) svg')).toHaveCount(1);await expect(page.locator('.mbp-diagram-error')).toHaveCount(0);
 const centers=await page.locator('.mbp-diagram svg').evaluate((root:SVGSVGElement)=>[...root.querySelectorAll<SVGGElement>('g.node')].map(node=>{const b=node.getBBox(),m=root.getCTM()!.inverse().multiply(node.getCTM()!),p=new DOMPoint(b.x+b.width/2,b.y+b.height/2).matrixTransform(m);return {x:p.x,y:p.y};}));expect(centers[0].x).toBeCloseTo(100,2);expect(centers[0].y).toBeCloseTo(100,2);expect(centers[1].x).toBeCloseTo(380,2);expect(centers[1].y).toBeCloseTo(260,2);expect(errors).toEqual([]);
});
