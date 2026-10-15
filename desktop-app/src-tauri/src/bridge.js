(() => {
  window.__MERMAID_BP_SAVE__ = async (blob, filename) => {
    try {
      await window.__TAURI__.core.invoke('save_document', {
        filename, bytes: Array.from(new Uint8Array(await blob.arrayBuffer())),
      });
    } catch (error) {
      window.alert('No se ha podido guardar el archivo: ' + String(error));
    }
  };
  window.open = (url) => {
    window.__TAURI__.core.invoke('open_preview', {url: new URL(url, location.href).href})
      .catch(error => window.alert(String(error)));
    return null;
  };
})();
