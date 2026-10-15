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
const token=location.hash.slice(1);
const channel=/^[a-f0-9-]{36}$/i.test(token)?new BroadcastChannel('mermaid-bp:preview:'+token):null;
if(channel)channel.onmessage=event=>{if(typeof event.data==='string'){textarea.value=event.data;void run();}};
window.addEventListener('pagehide',()=>channel?.close());
function loadDocument() {
  if(channel){channel.postMessage('request');return;}
  textarea.value=example;void run();
}
let renderGeneration=0;
async function run() {
  const generation=++renderGeneration,source=textarea.value;
  if(!isPluginEnabled('bookstack')){output.replaceChildren();status.textContent='BookStack está desactivado. Actívalo en Extensiones del editor.';return;}
  button.disabled = true; status.textContent = 'Renderizando…';
  const pre = document.createElement('pre'), code = document.createElement('code');
  code.className = 'language-mermaid'; code.textContent = source;
  pre.append(code); output.replaceChildren(pre);
  try {
    const result = await renderMermaidBlocks(output);
    if(generation!==renderGeneration)return;
    status.textContent = result.failed ? 'No se ha podido renderizar. Revisa la sintaxis.' : (hasManualLayout(source) ? 'Renderizado con Mermaid 11.17.2 y posiciones del editor.' : 'Renderizado con Mermaid 11.17.2 estándar.');
  } finally { if(generation===renderGeneration)button.disabled = false; }
}
button.onclick = run;
const loadButton=document.getElementById('check-draft') as HTMLButtonElement;
loadButton.onclick=loadDocument;loadButton.disabled=!channel;
if(!channel)loadButton.title='Abre esta vista desde BS preview del editor para recibir su documento.';
const folder=new URL('.',document.baseURI);
const packaged=folder.pathname.endsWith('/plugins/bookstack/');
if(packaged)document.querySelector<HTMLAnchorElement>('.check-layout>header>a')!.href=new URL('../../',folder).href;
void discoverPlugins(packaged?new URL('../',folder):undefined).then(()=>{loadDocument();});
