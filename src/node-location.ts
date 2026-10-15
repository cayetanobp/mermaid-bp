let timer:ReturnType<typeof setTimeout>;
export function clearNodeLocation(){clearTimeout(timer);document.querySelectorAll('[data-editor-overlay]').forEach(el=>el.remove());}
export function locateNode(id:string,camera:{x:number;y:number;zoom:number},transform:()=>void){
 clearNodeLocation();const viewport=document.getElementById('diagram-viewport')!,root=document.querySelector<SVGSVGElement>('#diagram svg');
 const node=[...document.querySelectorAll<SVGGElement>('#diagram g.node')].find(n=>n.dataset.nodeId===id);if(!root||!node)return;
 const box=node.getBoundingClientRect(),canvas=viewport.getBoundingClientRect();camera.x+=canvas.left+canvas.width/2-(box.left+box.width/2);camera.y+=canvas.top+canvas.height/2-(box.top+box.height/2);transform();
 const b=node.getBBox(),matrix=root.getScreenCTM()!.inverse().multiply(node.getScreenCTM()!);const points=[[b.x,b.y],[b.x+b.width,b.y],[b.x,b.y+b.height],[b.x+b.width,b.y+b.height]].map(([x,y])=>new DOMPoint(x,y).matrixTransform(matrix));
 const pad=8/camera.zoom,x=Math.min(...points.map(p=>p.x)),y=Math.min(...points.map(p=>p.y)),right=Math.max(...points.map(p=>p.x)),bottom=Math.max(...points.map(p=>p.y));
 const g=document.createElementNS('http://www.w3.org/2000/svg','g'),rect=document.createElementNS(g.namespaceURI,'rect');g.setAttribute('data-editor-overlay','node-location');g.setAttribute('aria-hidden','true');g.style.pointerEvents='none';
 for(const [key,value]of Object.entries({x:x-pad,y:y-pad,width:right-x+pad*2,height:bottom-y+pad*2,fill:'none',stroke:'#1f3a5f','stroke-width':3,'vector-effect':'non-scaling-stroke'}))rect.setAttribute(key,String(value));rect.classList.add('node-location');g.append(rect);root.append(g);timer=setTimeout(clearNodeLocation,6000);
}
