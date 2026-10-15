import {prepareSource} from '../../src/source-security';
import mermaid from 'mermaid';
import {sanitizeDiagram} from '../../src/svg-security';
import { parseFlow } from '../../src/flow';
import { validateMermaid, renderDiagram } from '../../src/render';
import { hasManualLayout } from '../../src/positions';

/** Reservar todos los bloques antes del primer await evita que CodeMirror los sustituya. */
export function reserveMermaidBlocks(scope: ParentNode = document, onlyManual = false): void {
  const targets = new Map<Element, string>();
  for (const block of scope.querySelectorAll<HTMLElement>('.language-mermaid, pre[data-language="mermaid"]')) {
    const target = block.closest('pre') ?? block;
    const source = block.textContent ?? '';
    if (onlyManual && (!hasManualLayout(source) || !parseFlow(source).ok)) continue;
    if (target.isConnected) targets.set(target, source);
  }
  for (const [target, source] of targets) {
    const pending = document.createElement('div');
    pending.className = 'mbp-pending'; pending.style.whiteSpace = 'pre-wrap';
    pending.textContent = source;
    if (target.id) pending.id = target.id;
    target.replaceWith(pending);
  }
}
const processing = new WeakSet<Element>();
// La configuración de Mermaid contiene funciones que structuredClone no admite.
function copyConfig<T>(value:T):T {
  if(Array.isArray(value))return value.map(copyConfig) as T;
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,copyConfig(item)])) as T;
  return value;
}
export interface BlockResult { rendered: number; failed: number }
export async function renderMermaidBlocks(scope: ParentNode = document, onlyManual = false): Promise<BlockResult> {
  reserveMermaidBlocks(scope, onlyManual);
  const result = { rendered: 0, failed: 0 };
  for (const block of scope.querySelectorAll<HTMLElement>('.mbp-pending')) {
    if (processing.has(block) || (onlyManual && !hasManualLayout(block.textContent ?? ''))) continue;
    processing.add(block);
    const source = block.textContent ?? '';
    const target = block;
    let container: HTMLDivElement | null = null;
    const previousConfig=onlyManual?copyConfig(mermaid.mermaidAPI.getSiteConfig()):null;
    try {
      await validateMermaid(source);
      const parsed = hasManualLayout(source) ? parseFlow(source) : null;
      const manual = !!parsed?.ok;
      container = document.createElement('div');
      container.className = manual ? 'mermaid mbp-diagram' : 'mermaid';
      if (target.id) container.id = target.id;
      if (manual) {
        const rendered = await renderDiagram(source, parsed!.ok ? parsed!.flow : undefined);
        if (!target.isConnected || block.textContent !== source) continue;
        container.setAttribute('role', 'img'); container.setAttribute('aria-label', 'Diagrama Mermaid');
        container.style.cssText = 'max-width:100%;overflow:auto;';
        container.innerHTML = rendered.svg;
        const svg = container.querySelector('svg')!;
        svg.style.maxWidth = '100%'; svg.style.height = 'auto';
        svg.setAttribute('width', String(rendered.geometry.width)); svg.setAttribute('height', String(rendered.geometry.height));
        target.replaceWith(container);
      } else {
        // Ruta estándar: Mermaid mide y dibuja en el lugar final, sin reescalar ni adaptar el SVG.
        container.textContent = prepareSource(source); target.replaceWith(container);
        await mermaid.run({ nodes: [container], suppressErrors: false });
        const root=container.querySelector('svg');if(!root)throw Error('No hay SVG');container.innerHTML=sanitizeDiagram(root.outerHTML);
      }
      if (container.nextElementSibling?.classList.contains('mbp-diagram-error')) container.nextElementSibling.remove();
      result.rendered++;
    } catch {
      result.failed++;
      if (container?.isConnected) container.replaceWith(target);
      if (!target.nextElementSibling?.classList.contains('mbp-diagram-error')) {
        const error = document.createElement('p');
        error.className = 'mbp-diagram-error'; error.setAttribute('role', 'status');
        error.textContent = 'No se ha podido dibujar este Mermaid. Revisa su código.';
        target.after(error);
      }
    } finally {
      if(previousConfig)mermaid.initialize(previousConfig);
      processing.delete(block);
    }
  }
  return result;
}
export function installBookStackViewer(): void {
  const run = () => { void renderMermaidBlocks(document, true); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
  else run();
}
