import {sameEdgeLabel} from './edge-label';
import {mermaidSourceId} from './mermaid-id';
import { edgePathMap, type Flow } from './flow';
import type { Geometry, Point } from './layout';
import type { Positions } from './positions';
import { connectionKey, type Connections } from './connections';
import { roundedPath, anchor } from './routes';
import type { GroupBox, GroupBoxes } from './groups';

export interface Curve { start:Point; end:Point; c1:Point; c2:Point }
type NodeState = { shapeElement:SVGGraphicsElement; element: SVGGElement; center: Point; matrix: DOMMatrix; inverse: DOMMatrix; width: number; height: number; shape: string };
type EdgeState = { markerStart:string|null; markerEnd:string|null; index: number; key: string; hit?: SVGPathElement; labelCenter?: Point; labelSize?: Point; element: SVGPathElement; from: string; to: string; points: Point[]; original: string; inverse: DOMMatrix; label?: SVGGElement; labelMatrix?: DOMMatrix; labelInverse?: DOMMatrix };
const zero = { x: 0, y: 0 };
const cleanDelta = (x: number, y: number): Point => ({ x: Math.abs(x) < 0.001 ? 0 : x, y: Math.abs(y) < 0.001 ? 0 : y });
const values = (m: DOMMatrix) => [m.a, m.b, m.c, m.d, m.e, m.f];
function localDelta(inverse: DOMMatrix, delta: Point): Point {
  return { x: inverse.a * delta.x + inverse.c * delta.y, y: inverse.b * delta.x + inverse.d * delta.y };
}
function parentInverse(root: SVGSVGElement, element: SVGElement): DOMMatrix {
  return root.getCTM()!.inverse().multiply((element.parentElement as unknown as SVGGraphicsElement).getCTM()!).inverse();
}
/** Conserva los SVG y estilos de Mermaid. Durante el arrastre solo cambia el nodo y sus aristas incidentes. */
export class ManualLayout {
  private nodes = new Map<string, NodeState>();
  private edges = new Set<EdgeState>();
  private edgesByIndex = new Map<number,EdgeState[]>();
  private adjacent = new Map<string, Set<EdgeState>>();
  private deltas = new Map<string, Point>();
  constructor(readonly root: SVGSVGElement, readonly flow: Flow, readonly geometry: Geometry, readonly connections: Connections = {}, readonly groups:GroupBoxes = {}) {
    root.dataset.layoutBox ??= JSON.stringify([root.viewBox.baseVal.x, root.viewBox.baseVal.y, root.viewBox.baseVal.width, root.viewBox.baseVal.height]);
    for (const element of root.querySelectorAll<SVGGElement>('g.node')) {
      const node = flow.nodes.find(n => mermaidSourceId(element).startsWith(`flowchart-${n.id}-`));
      if (!node || !geometry.nodes[node.id]) continue;
      const baseline = element.dataset.layoutBase ? JSON.parse(element.dataset.layoutBase) : {
        center: { ...geometry.nodes[node.id] }, matrix: values(element.transform.baseVal.consolidate()?.matrix ?? new DOMMatrix())
      };
      element.dataset.layoutBase = JSON.stringify(baseline);
      const shape = element.querySelector<SVGGraphicsElement>('.label-container, rect, polygon, circle, path') ?? element;
      const box = shape.getBBox(), transform = root.getCTM()!.inverse().multiply(element.getCTM()!);
      this.nodes.set(node.id, { shapeElement:shape, element, center: baseline.center, matrix: new DOMMatrix(baseline.matrix), inverse: parentInverse(root, element),
        width: Math.abs(transform.a)*box.width+Math.abs(transform.c)*box.height, height: Math.abs(transform.b)*box.width+Math.abs(transform.d)*box.height, shape: node.shape });
      this.deltas.set(node.id, cleanDelta(geometry.nodes[node.id].x - baseline.center.x, geometry.nodes[node.id].y - baseline.center.y));
    }
    const pathMap = edgePathMap(flow);
    const labels = [...root.querySelectorAll<SVGGElement>('.edgeLabels > g.edgeLabel')];
    const usedLabels = new Set<SVGGElement>();
    for (const element of root.querySelectorAll<SVGPathElement>('.edgePaths path.flowchart-link')) {
      const index = pathMap.get(mermaidSourceId(element));
      if (index === undefined) continue;
      const edge = flow.edges[index];
      const length = element.getTotalLength();
      const count = Math.max(2, Math.min(64, Math.ceil(length / 12)));
      const points: Point[] = element.dataset.layoutPoints ? JSON.parse(element.dataset.layoutPoints) : Array.from({ length: count + 1 }, (_, i) => {
        const p = element.getPointAtLength(length * i / count); return { x: p.x, y: p.y };
      });
      element.dataset.layoutPoints = JSON.stringify(points);
      element.dataset.layoutPath ??= element.getAttribute('d') ?? '';
      // Mermaid etiqueta cada conexión con un data-id; el orden solo es respaldo para versiones antiguas.
      const label = labels.find(g => g.querySelector('[data-id]')?.getAttribute('data-id') === element.id)
        ?? (edge.label ? labels.find(g => !usedLabels.has(g) && sameEdgeLabel(g.textContent,edge.label)) : undefined);
      if (label) {
        usedLabels.add(label);
        label.dataset.layoutMatrix ??= JSON.stringify(values(label.transform.baseVal.consolidate()?.matrix ?? new DOMMatrix()));
      }
      let labelCenter: Point | undefined; let labelSize: Point | undefined;
      if (label) {
        label.dataset.layoutCenter ??= JSON.stringify(new DOMPoint(0,0).matrixTransform(root.getCTM()!.inverse().multiply(label.getCTM()!)));
        const center = JSON.parse(label.dataset.layoutCenter); labelCenter = { x:center.x, y:center.y };
        const box=label.getBBox(),matrix=root.getCTM()!.inverse().multiply(label.getCTM()!);
        labelSize={x:Math.abs(matrix.a)*box.width+Math.abs(matrix.c)*box.height,y:Math.abs(matrix.b)*box.width+Math.abs(matrix.d)*box.height};
      }
      const hit = [...root.querySelectorAll<SVGPathElement>('.edge-hit')].find(p => p.dataset.hitFor === element.id);
      element.dataset.layoutMarkers ??= JSON.stringify([element.getAttribute('marker-start'),element.getAttribute('marker-end')]);
      const markers=JSON.parse(element.dataset.layoutMarkers);
      const state: EdgeState = { markerStart:markers[0],markerEnd:markers[1],index, key: connectionKey(flow.edges, index), hit, labelCenter, labelSize, element, from: edge.from, to: edge.to, points, original: element.dataset.layoutPath!, inverse: root.getCTM()!.inverse().multiply(element.getCTM()!).inverse(), label,
        labelMatrix: label ? new DOMMatrix(JSON.parse(label.dataset.layoutMatrix!)) : undefined, labelInverse: label ? parentInverse(root, label) : undefined };
      this.edges.add(state);
      if(!this.edgesByIndex.has(index)) this.edgesByIndex.set(index,[]);
      this.edgesByIndex.get(index)!.push(state);
      for (const id of new Set([edge.from, edge.to])) {
        if (!this.adjacent.has(id)) this.adjacent.set(id, new Set());
        this.adjacent.get(id)!.add(state);
      }
    }
  }
  private position(id: string, point: Point) {
    const node = this.nodes.get(id); if (!node) return;
    const delta = cleanDelta(point.x - node.center.x, point.y - node.center.y);
    this.deltas.set(id, delta);
    const d = localDelta(node.inverse, delta), m = node.matrix;
    node.element.setAttribute('transform', `matrix(${m.a} ${m.b} ${m.c} ${m.d} ${m.e + d.x} ${m.f + d.y})`);
    this.geometry.nodes[id] = { x: node.center.x + delta.x, y: node.center.y + delta.y };
  }
  private route(edge: EdgeState) {
    const a = this.deltas.get(edge.from) ?? zero, b = this.deltas.get(edge.to) ?? zero;
    const from = localDelta(edge.inverse, a), to = localDelta(edge.inverse, b), last = edge.points.length - 1;
    const points = edge.points.map((p, i) => {
      const t = i / last, weight = t*t*(3-2*t);
      return { x:p.x+from.x*(1-weight)+to.x*weight, y:p.y+from.y*(1-weight)+to.y*weight };
    });
    let labelShift = { x:(a.x+b.x)/2, y:(a.y+b.y)/2 };
    const ports = this.connections[edge.key];
    let path = roundedPath(points);
    if (ports) {
      const siblings=this.edgesByIndex.get(edge.index)!;
      if(edge!==siblings[0] && edge.from===edge.to) { edge.element.style.display='none';if(edge.hit)edge.hit.style.display='none';return; }
      edge.element.style.removeProperty('display');edge.hit?.style.removeProperty('display');
      const curve=this.curve(edge.index)!;
      const startPoint=new DOMPoint(curve.start.x,curve.start.y).matrixTransform(edge.inverse);
      const endPoint=new DOMPoint(curve.end.x,curve.end.y).matrixTransform(edge.inverse);
      const c1=new DOMPoint(curve.c1.x,curve.c1.y).matrixTransform(edge.inverse);
      const c2=new DOMPoint(curve.c2.x,curve.c2.y).matrixTransform(edge.inverse);
      if(edge.from===edge.to) {
        const marker=siblings.at(-1)!.markerEnd;
        if(marker)edge.element.setAttribute('marker-end',marker);
      }
      path = `M${startPoint.x},${startPoint.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${endPoint.x},${endPoint.y}`;
      if (edge.labelCenter) {
        const at=(t:number)=>{
          const u=1-t;
          return new DOMPoint(u*u*u*startPoint.x+3*u*u*t*c1.x+3*u*t*t*c2.x+t*t*t*endPoint.x,u*u*u*startPoint.y+3*u*u*t*c1.y+3*u*t*t*c2.y+t*t*t*endPoint.y).matrixTransform(edge.inverse.inverse());
        };
        const candidates=[0.5,0.4,0.6,0.3,0.7,0.2,0.8].map(at);
        const middle=candidates.find(p=>[edge.from,edge.to].every(id=>{
          const node=this.nodes.get(id)!,center=this.geometry.nodes[id],size=edge.labelSize ?? {x:0,y:0};
          return Math.abs(p.x-center.x)>(node.width+size.x)/2+6 || Math.abs(p.y-center.y)>(node.height+size.y)/2+6;
        })) ?? candidates[0];
        labelShift = { x:middle.x-edge.labelCenter.x, y:middle.y-edge.labelCenter.y };
      }
    } else {
      edge.element.style.removeProperty('display');edge.hit?.style.removeProperty('display');
      if(edge.markerStart)edge.element.setAttribute('marker-start',edge.markerStart);else edge.element.removeAttribute('marker-start');
      if(edge.markerEnd)edge.element.setAttribute('marker-end',edge.markerEnd);else edge.element.removeAttribute('marker-end');
    }
    edge.element.setAttribute('d', path); edge.hit?.setAttribute('d',path);
    if (edge.label && edge.labelMatrix && edge.labelInverse) {
      const d = localDelta(edge.labelInverse,labelShift), m=edge.labelMatrix;
      edge.label.setAttribute('transform',`matrix(${m.a} ${m.b} ${m.c} ${m.d} ${m.e+d.x} ${m.f+d.y})`);
    }
  }
  endpoint(index: number, end: 'from'|'to'): { point: Point; center: Point; angle: number } | null {
    const model=this.flow.edges[index]; if(!model) return null;
    const node=this.nodes.get(model[end]); if(!node) return null;
    const shapeBox=node.shapeElement.getBBox();
    const shapeMatrix=this.root.getCTM()!.inverse().multiply(node.shapeElement.getCTM()!);
    const actual=new DOMPoint(shapeBox.x+shapeBox.width/2,shapeBox.y+shapeBox.height/2).matrixTransform(shapeMatrix);
    const center={x:actual.x,y:actual.y};
    const width=Math.abs(shapeMatrix.a)*shapeBox.width+Math.abs(shapeMatrix.c)*shapeBox.height;
    const height=Math.abs(shapeMatrix.b)*shapeBox.width+Math.abs(shapeMatrix.d)*shapeBox.height;
    const states=this.edgesByIndex.get(index) ?? [];
    const edge=end==='from' ? states[0] : states.at(-1); if(!edge) return null;
    const original=end==='from' ? edge.points[0] : edge.points.at(-1)!;
    const p=new DOMPoint(original.x,original.y).matrixTransform(edge.inverse.inverse());
    const angle=this.connections[edge.key]?.[end] ?? Math.atan2(p.y-node.center.y,p.x-node.center.x)*180/Math.PI;
    const point=anchor(center,width,height,node.shape,angle);
    return {center,angle,point};
  }
  curve(index:number):Curve|null {
    const from=this.endpoint(index,'from'),to=this.endpoint(index,'to');if(!from||!to)return null;
    const model=this.flow.edges[index],ports=this.connections[connectionKey(this.flow.edges,index)];
    const length=model.from===model.to ? Math.max(90,this.nodes.get(model.from)!.width*0.8) : Math.max(35,Math.min(300,Math.hypot(to.point.x-from.point.x,to.point.y-from.point.y)*0.4));
    const a=ports?.bendFrom ?? {x:Math.cos(from.angle*Math.PI/180)*length,y:Math.sin(from.angle*Math.PI/180)*length};
    const b=ports?.bendTo ?? {x:Math.cos(to.angle*Math.PI/180)*length,y:Math.sin(to.angle*Math.PI/180)*length};
    return {start:from.point,end:to.point,c1:{x:from.point.x+a.x,y:from.point.y+a.y},c2:{x:to.point.x+b.x,y:to.point.y+b.y}};
  }
  setBend(index:number,end:'from'|'to',point:Point) {
    const endpoint=this.endpoint(index,end);if(!endpoint)return;
    const key=connectionKey(this.flow.edges,index),ports=this.connections[key] ??= {};
    ports[end==='from'?'bendFrom':'bendTo']={x:point.x-endpoint.point.x,y:point.y-endpoint.point.y};
    for(const edge of this.edgesByIndex.get(index) ?? [])this.route(edge);
  }
  resetConnection(index:number) {
    delete this.connections[connectionKey(this.flow.edges,index)];
    for(const edge of this.edgesByIndex.get(index) ?? [])this.route(edge);
  }
  setPort(index: number, end: 'from'|'to', angle?: number) {
    const previous=this.endpoint(index,end)?.angle;
    const key=connectionKey(this.flow.edges,index);
    const entry=this.connections[key] ??= {};
    if(angle===undefined) delete entry[end]; else entry[end]=((angle%360)+360)%360;
    const next=this.endpoint(index,end)?.angle,bendKey=end==='from'?'bendFrom':'bendTo',bend=entry[bendKey];
    if(bend && previous!==undefined && next!==undefined) {
      const delta=(next-previous)*Math.PI/180,c=Math.cos(delta),s=Math.sin(delta);
      entry[bendKey]={x:bend.x*c-bend.y*s,y:bend.x*s+bend.y*c};
    }
    if(!Object.keys(entry).length) delete this.connections[key];
    for(const edge of this.edgesByIndex.get(index) ?? []) this.route(edge);
  }
  move(id: string, point: Point) { this.moveMany({[id]:point}); }
  moveMany(positions: Positions) {
    const affected=new Set<EdgeState>();
    for(const [id,point] of Object.entries(positions)) {
      this.position(id,point);
      for(const edge of this.adjacent.get(id) ?? []) affected.add(edge);
    }
    for(const edge of affected) this.route(edge);
  }
  apply(positions: Positions) {
    for (const [id, point] of Object.entries(positions)) this.position(id, point);
    for (const edge of this.edges) if (this.deltas.has(edge.from) || this.deltas.has(edge.to)) this.route(edge);
    this.resizeGroups();
  }
  groupBox(id:string):GroupBox|null {
    const group=[...this.root.querySelectorAll<SVGGElement>('g.cluster')].find(g=>mermaidSourceId(g)===id);
    const rect=group?.querySelector<SVGRectElement>(':scope > rect');if(!rect)return null;
    // getBBox incluye la geometría CSS efectiva; baseVal puede conservar atributos antiguos.
    // Ambas matrices se refieren a la pantalla, incluso con grupos o SVG anidados.
    const box=rect.getBBox(),matrix=this.root.getScreenCTM()!.inverse().multiply(rect.getScreenCTM()!);
    const corners=[[box.x,box.y],[box.x+box.width,box.y],[box.x,box.y+box.height],[box.x+box.width,box.y+box.height]]
      .map(([x,y])=>new DOMPoint(x,y).matrixTransform(matrix));
    const x=Math.min(...corners.map(p=>p.x)),y=Math.min(...corners.map(p=>p.y));
    return {x,y,width:Math.max(...corners.map(p=>p.x))-x,height:Math.max(...corners.map(p=>p.y))-y};
  }
  setGroupBox(id:string,box:GroupBox) {
    this.groups[id]={...box,width:Math.max(40,box.width),height:Math.max(40,box.height)};
    this.resizeGroups(id);
  }
  fitGroup(id:string) {
    delete this.groups[id];this.resizeGroups();
    const box=this.groupBox(id);if(box)this.groups[id]=box;
  }
  resizeGroups(only?:string) {
    const rootInverse=this.root.getCTM()!.inverse();
    for(const group of this.root.querySelectorAll<SVGGElement>('g.cluster')) {
      if(only&&mermaidSourceId(group)!==only)continue;
      const rect=group.querySelector<SVGRectElement>(':scope > rect');if(!rect)continue;
      const inverse=rootInverse.multiply(group.getCTM()!).inverse();
      const label=group.querySelector<SVGGElement>(':scope > .cluster-label');
      let labelBox:DOMRect|undefined;
      if(label) {
        label.dataset.layoutGroupTitle ??= JSON.stringify(values(label.transform.baseVal.consolidate()?.matrix ?? new DOMMatrix()));
        label.setAttribute('transform',new DOMMatrix(JSON.parse(label.dataset.layoutGroupTitle)).toString());
        labelBox=label.getBBox();
      }
      let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
      const fixed=this.groups[mermaidSourceId(group)];
      if(fixed) {
        const a=new DOMPoint(fixed.x,fixed.y).matrixTransform(inverse),b=new DOMPoint(fixed.x+fixed.width,fixed.y+fixed.height).matrixTransform(inverse);
        left=a.x;top=a.y;right=b.x;bottom=b.y;
      } else {
        for(const node of this.flow.nodes) {
          if(!node.group?.split('/').includes(mermaidSourceId(group)))continue;
          const state=this.nodes.get(node.id);if(!state)continue;
          const box=state.shapeElement.getBBox(),matrix=inverse.multiply(rootInverse.multiply(state.shapeElement.getCTM()!));
          const a=new DOMPoint(box.x,box.y).matrixTransform(matrix),b=new DOMPoint(box.x+box.width,box.y+box.height).matrixTransform(matrix);
          left=Math.min(left,a.x-20);top=Math.min(top,a.y-(labelBox?.height ?? 15)-24);
          right=Math.max(right,b.x+20);bottom=Math.max(bottom,b.y+20);
        }
        if(!Number.isFinite(left)) {
          left=rect.x.baseVal.value;top=rect.y.baseVal.value;right=left+rect.width.baseVal.value;bottom=top+rect.height.baseVal.value;
        }
        const width=Math.max(40,(labelBox?.width ?? 0)+32,right-left),center=(left+right)/2;
        left=center-width/2;right=center+width/2;bottom=Math.max(bottom,top+40);
      }
      rect.setAttribute('x',String(left));rect.setAttribute('y',String(top));
      rect.setAttribute('width',String(right-left));rect.setAttribute('height',String(bottom-top));
      if(label&&labelBox) {
        const m=label.transform.baseVal.consolidate()?.matrix ?? new DOMMatrix();
        const current=new DOMPoint(labelBox.x+labelBox.width/2,labelBox.y).matrixTransform(m);
        label.setAttribute('transform',`matrix(${m.a} ${m.b} ${m.c} ${m.d} ${m.e+(left+right)/2-current.x} ${m.f+top+8-current.y})`);
      }
    }
  }
  bounds() {
    const box = JSON.parse(this.root.dataset.layoutBox!);
    const old = { x: box[0], y: box[1], width: box[2], height: box[3] }, b = this.root.getBBox(), padding = 16;
    const x = b.x < old.x ? b.x - padding : old.x, y = b.y < old.y ? b.y - padding : old.y;
    const width = Math.max(old.x + old.width, b.x + b.width > old.x + old.width ? b.x + b.width + padding : 0) - x;
    const height = Math.max(old.y + old.height, b.y + b.height > old.y + old.height ? b.y + b.height + padding : 0) - y;
    this.root.setAttribute('viewBox', `${x} ${y} ${width} ${height}`);
    this.geometry.width = width; this.geometry.height = height;
    return { x: x - old.x, y: y - old.y };
  }
}
