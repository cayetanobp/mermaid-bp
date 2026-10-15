/** Los saltos de línea SVG pueden separar palabras en tspan sin conservar el espacio en textContent. */
export function sameEdgeLabel(rendered:string|null,source:string):boolean{
 return (rendered??'').replace(/\s+/g,'')===source.replace(/\s+/g,'');
}
