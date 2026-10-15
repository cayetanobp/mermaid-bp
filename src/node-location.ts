const ns='http://www.w3.org/2000/svg';
const nodeElement=(id:string)=>[...document.querySelectorAll<SVGGElement>('#diagram g.node')].find(node=>node.dataset.nodeId===id);
export function clearNodeLocation(){document.querySelectorAll('[data-editor-overlay]').forEach(element=>element.remove());}
/** Una capa independiente del SVG evita que la marca altere límites, posiciones o exportaciones. */
export function highlightNode(id:string,zoom:number){
 clearNodeLocation();const node=nodeElement(id),stage=document.getElementById('diagram-stage');if(!node||!stage)return;
 const box=node.getBoundingClientRect(),origin=stage.getBoundingClientRect(),pad=8/zoom;
 const overlay=document.createElementNS(ns,'svg'),rect=document.createElementNS(ns,'rect');
 overlay.setAttribute('data-editor-overlay','node-location');overlay.setAttribute('data-highlight-node',id);overlay.setAttribute('aria-hidden','true');overlay.setAttribute('width','1');overlay.setAttribute('height','1');
 overlay.style.cssText='position:absolute;left:0;top:0;overflow:visible;pointer-events:none;z-index:2;display:block';
 for(const[key,value]of Object.entries({x:(box.left-origin.left)/zoom-pad,y:(box.top-origin.top)/zoom-pad,width:box.width/zoom+pad*2,height:box.height/zoom+pad*2,fill:'none',stroke:'#1f3a5f','stroke-width':3,'vector-effect':'non-scaling-stroke'}))rect.setAttribute(key,String(value));
 rect.classList.add('node-location');overlay.append(rect);stage.append(overlay);
}
/** Centrar es independiente de la selección y conserva la escala y su resaltado. */
export function locateNode(id:string,camera:{x:number;y:number;zoom:number},transform:()=>void){
 const node=nodeElement(id),viewport=document.getElementById('diagram-viewport');if(!node||!viewport)return;
 const box=node.getBoundingClientRect(),canvas=viewport.getBoundingClientRect();camera.x+=canvas.left+canvas.width/2-(box.left+box.width/2);camera.y+=canvas.top+canvas.height/2-(box.top+box.height/2);transform();
}
