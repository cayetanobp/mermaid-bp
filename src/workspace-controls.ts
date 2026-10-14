interface WorkspaceControls {
  onDiagramModeChange: (expanded: boolean) => void;
  onToolbarChange: () => void;
}

/** Controles de espacio que no modifican el documento ni su historial. */
export function setupWorkspaceControls(callbacks: WorkspaceControls): void {
  const app = document.getElementById('app')!;
  const toolbar = document.getElementById('file-toolbar')!;
  const toolbarButton = document.getElementById('toolbar-toggle') as HTMLButtonElement;
  const fullscreenButton = document.getElementById('diagram-fullscreen') as HTMLButtonElement;
  let collapsed = false, expanded = false;
  try { collapsed = localStorage.getItem('mermaid-bp:toolbar-collapsed') === 'true'; } catch { /* Preferencia solo en memoria. */ }

  function updateToolbar() {
    toolbar.hidden = collapsed;
    toolbarButton.setAttribute('aria-expanded', String(!collapsed));
    const label = collapsed ? 'Mostrar herramientas' : 'Ocultar herramientas';
    toolbarButton.setAttribute('aria-label', label); toolbarButton.title = label;
    toolbarButton.querySelector('.control-label')!.textContent = label;
    toolbarButton.querySelector('.collapse-icon')!.textContent = collapsed ? '▾' : '▴';
  }
  toolbarButton.onclick = () => {
    collapsed = !collapsed; updateToolbar();
    try { localStorage.setItem('mermaid-bp:toolbar-collapsed', String(collapsed)); } catch { /* No bloquear la interfaz. */ }
    callbacks.onToolbarChange();
  };
  updateToolbar();

  function setDiagramMode(next: boolean) {
    if (expanded === next) return;
    expanded = next;
    app.classList.toggle('diagram-focus', expanded);
    fullscreenButton.setAttribute('aria-pressed', String(expanded));
    const label = expanded ? 'Salir de pantalla completa' : 'Pantalla completa';
    fullscreenButton.setAttribute('aria-label', label); fullscreenButton.title = expanded ? `${label} (Esc)` : label;
    fullscreenButton.querySelector('.control-label')!.textContent = label;
    callbacks.onDiagramModeChange(expanded);
    if (!expanded) fullscreenButton.focus({ preventScroll: true });
  }
  async function leave() {
    setDiagramMode(false);
    if (document.fullscreenElement === app) {
      try { await document.exitFullscreen(); } catch { /* El modo de ventana ya se ha restaurado. */ }
    }
  }
  fullscreenButton.onclick = async () => {
    if (expanded) { await leave(); return; }
    setDiagramMode(true);
    if (!document.fullscreenElement && document.fullscreenEnabled && app.requestFullscreen) {
      try { await app.requestFullscreen(); }
      catch { /* En paneles que lo bloqueen, el diagrama ocupa toda la ventana disponible. */ }
    }
  };
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) setDiagramMode(false);
  });
  window.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !expanded || event.defaultPrevented || document.querySelector('dialog[open]')) return;
    event.preventDefault(); void leave();
  });
}
