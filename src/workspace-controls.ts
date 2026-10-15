interface WorkspaceControls {
  onDiagramModeChange: (expanded: boolean) => void;
  onToolbarChange: () => void;
}

/** Controles de espacio que no modifican el documento ni su historial. */
export function setupWorkspaceControls(callbacks: WorkspaceControls): void {
  const app = document.getElementById('app')!;
  const fullscreenButton = document.getElementById('diagram-fullscreen') as HTMLButtonElement;
  let expanded = false;

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
  function leave() { setDiagramMode(false); }
  fullscreenButton.onclick = () => setDiagramMode(!expanded);
  window.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !expanded || event.defaultPrevented || document.querySelector('dialog[open]')) return;
    event.preventDefault(); void leave();
  });
}
