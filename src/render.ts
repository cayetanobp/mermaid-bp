import {mermaidSourceId} from './mermaid-id';
import mermaid from 'mermaid';
import {assertSourceSafe,prepareSource} from './source-security';
import {sanitizeDiagram} from './svg-security';
import { readGroups } from './groups';
import { readConnections } from './connections';
import { readPositions, hasManualLayout } from './positions';
import { ManualLayout } from './manual-layout';
import type { Flow } from './flow';
import type { Geometry } from './layout';

function initializeRenderer(){
 mermaid.initialize({startOnLoad:false,suppressErrorRendering:true,securityLevel:'strict',htmlLabels:false,maxTextSize:200_000,maxEdges:500,
 secure:['secure','securityLevel','startOnLoad','maxTextSize','maxEdges','suppressErrorRendering','htmlLabels','themeCSS','fontFamily','altFontFamily','themeVariables','dompurifyConfig']});
}
export async function validateMermaid(source:string):Promise<void>{initializeRenderer();assertSourceSafe(source);await mermaid.parse(prepareSource(source));}
let counter = 0;
let chain: Promise<unknown> = Promise.resolve();
export interface Rendered { svg: string; geometry: Geometry }
export function renderDiagram(source: string, flow?: Flow): Promise<Rendered> {
  assertSourceSafe(source);
  const task = chain.then(async () => {
    initializeRenderer();
    await mermaid.parse(prepareSource(source));
    const host = document.createElement('div');
    host.className = 'render-host';
    host.style.cssText = 'position:fixed;left:-20000px;top:0;width:1600px;height:1200px;visibility:hidden;pointer-events:none;';
    document.body.append(host);
    try {
      const { svg } = await mermaid.render(`mbp_${++counter}`, prepareSource(source), host);
      host.innerHTML = sanitizeDiagram(svg);
      const root = host.querySelector('svg')!;
      const box = root.viewBox.baseVal;
      const geometry: Geometry = { nodes: {}, width: box.width, height: box.height };
      if (flow) {
        for (const group of root.querySelectorAll<SVGGElement>('g.node')) {
          const node = flow.nodes.find(n => mermaidSourceId(group).startsWith(`flowchart-${n.id}-`));
          if (!node) continue;
          const b = group.getBBox();
          const matrix = root.getCTM()!.inverse().multiply(group.getCTM()!);
          const center = new DOMPoint(b.x + b.width / 2, b.y + b.height / 2).matrixTransform(matrix);
          geometry.nodes[node.id] = { x: center.x, y: center.y };
        }
      }
      if (flow) {
        const manual = new ManualLayout(root, flow, geometry, readConnections(source), readGroups(source));
        if(hasManualLayout(source)){manual.apply(readPositions(source)); manual.bounds();}
      }
      const bounds=root.viewBox.baseVal;
      if(![bounds.x,bounds.y,bounds.width,bounds.height].every(Number.isFinite)||bounds.width>50_000||bounds.height>50_000||root.querySelectorAll('*').length>20_000)throw Error('El diagrama supera los límites de complejidad o tamaño.');
      return { svg: root.outerHTML, geometry };
    } finally { host.remove(); }
  });
  chain = task.catch(() => undefined);
  return task;
}

export function svgDocument(svg: SVGSVGElement): string {
  const copy = svg.cloneNode(true) as SVGSVGElement;
  copy.querySelectorAll('[data-editor-overlay], .selection-ring, .edge-hit, .port-handle, .bend-handle, .port-guide, .group-handle, .group-selection').forEach(el => el.remove());
  copy.querySelectorAll('*').forEach(el => { for(const attribute of [...el.attributes]) if(attribute.name.startsWith('data-layout-')) el.removeAttribute(attribute.name); });
  copy.removeAttribute('data-layout-box');
  copy.querySelectorAll('[data-node-id]').forEach(el => {
    el.removeAttribute('data-node-id'); el.classList.remove('editable-node');
  });
  copy.querySelectorAll('[data-edge-index]').forEach(el => {
    el.removeAttribute('data-edge-index'); el.classList.remove('selected-edge');
  });
  copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  copy.setAttribute('width', String(Math.ceil(copy.viewBox.baseVal.width)));
  copy.setAttribute('height', String(Math.ceil(copy.viewBox.baseVal.height)));
  copy.style.maxWidth = 'none';
  copy.style.background = '#ffffff';
  return sanitizeDiagram(new XMLSerializer().serializeToString(copy));
}
export function download(blob: Blob, filename: string): void {
  const save = (window as Window & {__MERMAID_BP_SAVE__?: (blob: Blob, filename: string) => Promise<void>}).__MERMAID_BP_SAVE__;
  if (save) { void save(blob, filename); return; }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function pngBlob(svg: string, width: number, height: number): Promise<Blob> {
  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await image.decode();
  const scale = Math.min(2, 8192 / Math.max(width, height), Math.sqrt(32_000_000 / (width * height)));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(width * scale)); canvas.height = Math.max(1, Math.ceil(height * scale));
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('No se pudo crear el PNG.')), 'image/png'));
}
