import DOMPurify from 'dompurify';
/** Segunda barrera antes de insertar o exportar un SVG generado. */
export function sanitizeDiagram(svg:string):string {
 const clean=DOMPurify.sanitize(svg,{USE_PROFILES:{svg:true,svgFilters:true,html:true},FORBID_TAGS:['script','iframe','object','embed','form','input','button','a','image','img','video','audio','link','meta','base','animate','set','foreignObject'],FORBID_ATTR:['href','xlink:href','src','srcset','formaction','action','target'],ALLOW_DATA_ATTR:false,ADD_TAGS:['style']});
 const document=new DOMParser().parseFromString(clean,'image/svg+xml');
 if(document.querySelector('parsererror')||document.documentElement.localName!=='svg')throw Error('El renderizador no ha generado un SVG válido.');
 for(const element of document.querySelectorAll('*')){
  for(const attr of [...element.attributes])if(/^on/i.test(attr.name))element.removeAttribute(attr.name);
  const style=element.getAttribute('style');if(style&&/(?:@import|expression\s*\(|url\s*\(\s*(?!["']?#))/i.test(style))element.removeAttribute('style');
 }
 for(const style of document.querySelectorAll('style')){
  if(/(?:@import|expression\s*\(|url\s*\(\s*(?!["']?#))/i.test(style.textContent??''))style.remove();
 }
 return document.documentElement.outerHTML;
}
