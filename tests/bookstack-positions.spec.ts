import {command} from './menu-helpers';
import {openBookStack} from './document-helpers';
import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const ready = (p: Page) => expect(p.locator('#render-state')).toHaveText('Actualizado');
async function scene(p: Page, selector: string) {
  return p.locator(selector).evaluate((root: SVGSVGElement) => {
    const nodes = [...root.querySelectorAll<SVGGElement>('g.node')].map(n => {
      const shape = n.querySelector<SVGGraphicsElement>('.label-container, rect, polygon, circle, path')!;
      const b = shape.getBBox(), m = root.getCTM()!.inverse().multiply(n.getCTM()!);
      const point = new DOMPoint(b.x + b.width / 2, b.y + b.height / 2).matrixTransform(m);
      return { id: n.id.replace(root.id+'-','').replace(/-\d+$/, ''), x: point.x, y: point.y, text: n.textContent, fill: getComputedStyle(shape).fill };
    }).sort((a,b) => a.id.localeCompare(b.id));
    const paths = [...root.querySelectorAll<SVGPathElement>('.edgePaths path.flowchart-link')].map(path => {
      const m = root.getCTM()!.inverse().multiply(path.getCTM()!);
      const length = path.getTotalLength();
      return { id: path.id.replace(root.id+'-',''), samples: Array.from({length:11}, (_,i) => {
        const p = path.getPointAtLength(length * i / 10).matrixTransform(m); return { x:p.x, y:p.y };
      }) };
    }).sort((a,b) => a.id.localeCompare(b.id));
    return { nodes, paths, groups: root.querySelectorAll('g.cluster').length };
  });
}
function same(a: Awaited<ReturnType<typeof scene>>, b: Awaited<ReturnType<typeof scene>>) {
  expect(b.groups).toBe(a.groups); expect(b.nodes).toHaveLength(a.nodes.length); expect(b.paths).toHaveLength(a.paths.length);
  a.nodes.forEach((n,i) => {
    expect(b.nodes[i].id).toBe(n.id); expect(b.nodes[i].text).toBe(n.text); expect(b.nodes[i].fill).toBe(n.fill);
    expect(b.nodes[i].x).toBeCloseTo(n.x, 2); expect(b.nodes[i].y).toBeCloseTo(n.y, 2);
  });
  a.paths.forEach((path,i) => {
    expect(b.paths[i].id).toBe(path.id);
    path.samples.forEach((p,j) => {
      expect(b.paths[i].samples[j].x).toBeCloseTo(p.x, 1);
      expect(b.paths[i].samples[j].y).toBeCloseTo(p.y, 1);
    });
  });
}
test('el visor reserva todos los bloques antes que CodeMirror, aísla errores y no duplica diagramas', async ({ page }) => {
  const errors:string[]=[]; page.on('pageerror', e=>errors.push(e.message));
  const source = '%% mermaid-bp:manual-layout\nflowchart LR\nA["uno"] --> B["dos"]\n%% graph:positions {"A":{"x":-100,"y":100},"B":{"x":350,"y":250}}';
  await page.route('**/integration-test.html', route=>route.fulfill({contentType:'text/html',body:
    '<!doctype html><html><head><meta charset="utf-8"></head><body><main id="page-content"></main><script type="module">'+
    'import { installBookStackViewer, renderMermaidBlocks } from "/bookstack-viewer.js";'+
    'const content=document.getElementById("page-content");'+
    'for(const source of '+JSON.stringify([source,'flowchart TD\nA["incompleto','sequenceDiagram\nAlice->>Bob: hola'])+'){'+
    'const pre=document.createElement("pre"),code=document.createElement("code");code.className="language-mermaid";code.textContent=source;pre.append(code);content.append(pre);}'+
    'const rendering=renderMermaidBlocks(content);'+
    'const leftovers=content.querySelectorAll("pre");document.body.dataset.highlighted=String(leftovers.length);'+
    'for(const pre of leftovers){const cm=document.createElement("div");cm.className="cm-editor";cm.textContent=pre.textContent;pre.replaceWith(cm);}'+
    'await rendering;await renderMermaidBlocks(content);installBookStackViewer();'+
    'document.body.dataset.ready="yes";</script></body></html>'}));
  await page.goto('/integration-test.html'); await expect(page.locator('body')).toHaveAttribute('data-ready','yes');
  await expect(page.locator('.mbp-diagram')).toHaveCount(1);
  await expect(page.locator('.mermaid svg')).toHaveCount(2);
  await expect(page.locator('.mbp-diagram-error')).toHaveCount(1);
  await expect(page.locator('body')).toHaveAttribute('data-highlighted','0');
  await expect(page.locator('.cm-editor')).toHaveCount(0);
  await expect(page.locator('.mbp-pending')).toHaveCount(1);
  await expect(page.locator('.render-host')).toHaveCount(0);
  const actual = await scene(page,'.mbp-diagram svg >> nth=0');
  const a=actual.nodes.find(n=>n.id==='flowchart-A')!,b=actual.nodes.find(n=>n.id==='flowchart-B')!;
  expect(a.x).toBeCloseTo(-100,2);expect(a.y).toBeCloseTo(100,2);
  expect(b.x).toBeCloseTo(350,2);expect(b.y).toBeCloseTo(250,2);expect(errors).toEqual([]);
});

test('el encabezado descargable se puede pegar solo, con Mermaid CDN y posiciones manuales', async ({ page }) => {
  const header=await readFile(new URL('../dist/bookstack-header.html',import.meta.url),'utf8');
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://cdn.jsdelivr.net/npm/mermaid@11.17.2/dist/**', async route=>{
    const relative=new URL(route.request().url()).pathname.split('/dist/')[1];
    if(!relative || relative.split('/').includes('..')) return route.abort();
    const body=await readFile(new URL('../node_modules/mermaid/dist/'+relative,import.meta.url));
    await route.fulfill({contentType:'text/javascript',headers:{'access-control-allow-origin':'*'},body});
  });
  const source='%% mermaid-bp:manual-layout\nflowchart TD\nA["origen"] --> B["destino"]\n%% graph:positions {"A":{"x":-50,"y":40},"B":{"x":280,"y":170}}';
  const escaped=source.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
  await page.route('**/header-test.html',route=>route.fulfill({contentType:'text/html',body:
    '<!doctype html><html><head><meta charset="utf-8">'+header+'</head><body><pre><code class="language-mermaid">'+escaped+'</code></pre></body></html>'}));
  await page.goto('/header-test.html');await expect(page.locator('.mbp-diagram svg')).toHaveCount(1);
  const actual=await scene(page,'.mbp-diagram svg');
  const a=actual.nodes.find(n=>n.id==='flowchart-A')!,b=actual.nodes.find(n=>n.id==='flowchart-B')!;
  expect(a.x).toBeCloseTo(-50,2);expect(a.y).toBeCloseTo(40,2);
  expect(b.x).toBeCloseTo(280,2);expect(b.y).toBeCloseTo(170,2);
  expect(errors).toEqual([]);
});
