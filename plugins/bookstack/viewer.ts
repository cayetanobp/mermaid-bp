import mermaid from 'mermaid';
import { parseFlow } from '../../src/flow';
import { renderDiagram } from '../../src/render';
import { hasManualLayout } from '../../src/positions';

/** Reservar todos los bloques antes del primer await evita que CodeMirror los sustituya. */
export function reserveMermaidBlocks(scope: ParentNode = document): void {
  const targets = new Map<Element, string>();
  for (const block of scope.querySelectorAll<HTMLElement>('.language-mermaid, pre[data-language="mermaid"]')) {
    const target = block.closest('pre') ?? block;
    if (target.isConnected) targets.set(target, block.textContent ?? '');
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
export interface BlockResult { rendered: number; failed: number }
export async function renderMermaidBlocks(scope: ParentNode = document): Promise<BlockResult> {
  reserveMermaidBlocks(scope);
  const result = { rendered: 0, failed: 0 };
  for (const block of scope.querySelectorAll<HTMLElement>('.mbp-pending')) {
    if (processing.has(block)) continue;
    processing.add(block);
    const source = block.textContent ?? '';
    const target = block;
    let container: HTMLDivElement | null = null;
    try {
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
        container.textContent = source; target.replaceWith(container);
        await mermaid.run({ nodes: [container], suppressErrors: false });
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
    } finally { processing.delete(block); }
  }
  return result;
}
export function installBookStackViewer(): void {
  const run = () => { void renderMermaidBlocks(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
  else run();
}
