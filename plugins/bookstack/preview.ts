import {isPluginEnabled,discoverPlugins} from '../../src/plugin-state';
import { hasManualLayout } from '../../src/positions';
import { example } from '../../src/flow';
import { renderMermaidBlocks } from './viewer';
import '../../src/style.css';
import '../../src/check.css';
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/source-serif-4/latin-600.css';
import '../../src/institutional.css';
const textarea = document.getElementById('check-source') as HTMLTextAreaElement;
const output = document.getElementById('check-output')!;
const status = document.getElementById('check-state')!;
const button = document.getElementById('check-run') as HTMLButtonElement;
function loadDraft() {
  try { textarea.value = JSON.parse(localStorage.getItem('mermaid-bp:draft:v1') || 'null')?.source ?? example; }
  catch { textarea.value = example; }
}
async function run() {
  if(!isPluginEnabled('bookstack')){output.replaceChildren();status.textContent='BookStack está desactivado. Actívalo en Extensiones del editor.';return;}
  button.disabled = true; status.textContent = 'Renderizando…';
  const pre = document.createElement('pre'), code = document.createElement('code');
  code.className = 'language-mermaid'; code.textContent = textarea.value;
  pre.append(code); output.replaceChildren(pre);
  try {
    const result = await renderMermaidBlocks(output);
    status.textContent = result.failed ? 'No se ha podido renderizar. Revisa la sintaxis.' : (hasManualLayout(textarea.value) ? 'Renderizado con Mermaid 11.7.0 y posiciones del editor.' : 'Renderizado con Mermaid 11.7.0 estándar.');
  } finally { button.disabled = false; }
}
button.onclick = run;
document.getElementById('check-draft')!.onclick = () => { const folder=new URL('.',document.baseURI);
const packaged=folder.pathname.endsWith('/plugins/bookstack/');
if(packaged)document.querySelector<HTMLAnchorElement>('.check-layout>header>a')!.href=new URL('../../',folder).href;
void discoverPlugins(packaged?new URL('../',folder):undefined).then(()=>{loadDraft();void run();}); };
const folder=new URL('.',document.baseURI);
const packaged=folder.pathname.endsWith('/plugins/bookstack/');
if(packaged)document.querySelector<HTMLAnchorElement>('.check-layout>header>a')!.href=new URL('../../',folder).href;
void discoverPlugins(packaged?new URL('../',folder):undefined).then(()=>{loadDraft();void run();});
