import mermaid from 'mermaid';
import type { Flow } from './flow';
import type { Geometry } from './layout';

mermaid.initialize({ startOnLoad: false, suppressErrorRendering: true });
let counter = 0;
let chain: Promise<unknown> = Promise.resolve();
export interface Rendered { svg: string; geometry: Geometry }
export function renderDiagram(source: string, flow?: Flow): Promise<Rendered> {
  const task = chain.then(async () => {
    const host = document.createElement('div');
    host.className = 'render-host';
    document.body.append(host);
    try {
      const { svg } = await mermaid.render(`mbp_${++counter}`, source, host);
      host.innerHTML = svg;
      const root = host.querySelector('svg')!;
      const box = root.viewBox.baseVal;
      const geometry: Geometry = { nodes: {}, width: box.width, height: box.height };
      if (flow) {
        for (const group of root.querySelectorAll<SVGGElement>('g.node')) {
          const node = flow.nodes.find(n => group.id.startsWith(`flowchart-${n.id}-`));
          if (!node) continue;
          const b = group.getBBox();
          const matrix = root.getCTM()!.inverse().multiply(group.getCTM()!);
          const center = new DOMPoint(b.x + b.width / 2, b.y + b.height / 2).matrixTransform(matrix);
          geometry.nodes[node.id] = { x: center.x, y: center.y };
        }
      }
      return { svg, geometry };
    } finally { host.remove(); }
  });
  chain = task.catch(() => undefined);
  return task;
}

export function svgDocument(svg: SVGSVGElement): string {
  const copy = svg.cloneNode(true) as SVGSVGElement;
  copy.querySelectorAll('.selection-ring').forEach(el => el.remove());
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
  return new XMLSerializer().serializeToString(copy);
}
export function download(blob: Blob, filename: string): void {
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
