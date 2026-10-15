/** Retirar el único borrador que podían guardar versiones anteriores. */
export function discardLegacyDraft():void {
  try{localStorage.removeItem('mermaid-bp:draft:v1');}
  catch{/* El editor funciona sin almacenamiento del navegador. */}
}
