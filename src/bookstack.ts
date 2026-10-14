import mermaid from 'mermaid';
import { example } from './flow';
import './style.css';
import './check.css';
mermaid.initialize({ startOnLoad: false });
const textarea = document.getElementById('check-source') as HTMLTextAreaElement;
const output = document.getElementById('check-output')!;
const status = document.getElementById('check-state')!;
const button = document.getElementById('check-run') as HTMLButtonElement;
function loadDraft() {
  try { textarea.value = JSON.parse(localStorage.getItem('mermaid-bp:draft:v1') || 'null')?.source ?? example; }
  catch { textarea.value = example; }
}
async function run() {
  button.disabled = true;
  status.textContent = 'Renderizando…';
  const pre = document.createElement('pre'), code = document.createElement('code');
  code.className = 'language-mermaid'; code.textContent = textarea.value;
  pre.append(code); output.replaceChildren(pre);
  try {
    // Mismo procedimiento que la integración proporcionada por el usuario.
    document.querySelectorAll('.language-mermaid').forEach(block => {
      const div = document.createElement('div');
      div.className = 'mermaid';
      div.textContent = block.textContent;
      block.closest('pre') ? block.closest('pre')!.replaceWith(div) : block.replaceWith(div);
    });
    await mermaid.run();
    status.textContent = 'Renderizado con Mermaid 11.7.0.';
  } catch { status.textContent = 'No se ha podido renderizar. Revisa la sintaxis.'; }
  finally { button.disabled = false; }
}
button.onclick = run;
document.getElementById('check-draft')!.onclick = () => { loadDraft(); void run(); };
loadDraft();
if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', () => void run(), { once: true });
else void run();
