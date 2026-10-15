/** Mermaid reciente añade el identificador del SVG para evitar colisiones en el documento. */
export function mermaidSourceId(element:Element):string{
 const prefix=(element.closest('svg')?.id??'')+'-';
 return element.id.startsWith(prefix)?element.id.slice(prefix.length):element.id;
}
