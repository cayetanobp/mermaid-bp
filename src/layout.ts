import type { Flow } from './flow';
export interface Point { x: number; y: number }
export interface Geometry { nodes: Record<string, Point>; width: number; height: number }
export function scoreLayout(before: Geometry, after: Geometry, id: string, target: Point): number {
  if (!after.nodes[id]) return Infinity;
  const scale = Math.max(1, Math.hypot(before.width, before.height) / Math.max(2, Math.sqrt(Object.keys(before.nodes).length)));
  // Coordenadas relativas al centroide de los otros nodos para ignorar traslaciones del SVG.
  const ids = Object.keys(before.nodes).filter(key => key !== id && after.nodes[key]);
  const centroid = (g: Geometry): Point => ids.length ? {
    x: ids.reduce((s, k) => s + g.nodes[k].x, 0) / ids.length,
    y: ids.reduce((s, k) => s + g.nodes[k].y, 0) / ids.length,
  } : { x: 0, y: 0 };
  const a = centroid(before), b = centroid(after);
  const aligned = (key: string): Point => ({ x: after.nodes[key].x - b.x + a.x, y: after.nodes[key].y - b.y + a.y });
  const point = aligned(id);
  const destination = Math.hypot(point.x - target.x, point.y - target.y) / scale;
  const movement = ids.reduce((s, key) => {
    const p = aligned(key);
    return s + Math.hypot(p.x - before.nodes[key].x, p.y - before.nodes[key].y) / scale;
  }, 0) / Math.max(1, ids.length);
  const areaGrowth = Math.max(0, (after.width * after.height) / Math.max(1, before.width * before.height) - 1);
  return destination + movement * 0.15 + areaGrowth * 0.1;
}
export function layoutCandidates(flow: Flow, id: string, target: Point, geometry: Geometry): Flow[] {
  const origin = flow.nodes.findIndex(n => n.id === id);
  if (origin < 0) return [];
  const base = structuredClone(flow);
  const others = flow.nodes.filter(n => n.id !== id && (n.group ?? '') === (flow.nodes[origin].group ?? '')).sort((a, b) => {
    const p = geometry.nodes[a.id], q = geometry.nodes[b.id];
    return (p ? Math.hypot(p.x - target.x, p.y - target.y) : Infinity) - (q ? Math.hypot(q.x - target.x, q.y - target.y) : Infinity);
  });
  const out: Flow[] = [];
  for (const neighbor of others.slice(0, 2)) {
    for (const offset of [0, 1]) {
      const candidate = structuredClone(base);
      const [node] = candidate.nodes.splice(origin, 1);
      candidate.nodes.splice(candidate.nodes.findIndex(n => n.id === neighbor.id) + offset, 0, node);
      out.push(candidate);
    }
    const p = geometry.nodes[neighbor.id];
    if (!p) continue;
    const horizontal = flow.direction === 'LR' || flow.direction === 'RL';
    const reversed = flow.direction === 'RL' || flow.direction === 'BT';
    const earlier = (horizontal ? target.x < p.x : target.y < p.y) !== reversed;
    const candidate = structuredClone(base);
    candidate.constraints = candidate.constraints.filter(c => c.from !== id && c.to !== id);
    const from = earlier ? id : neighbor.id, to = earlier ? neighbor.id : id;
    if (!candidate.edges.some(e => e.from === from && e.to === to)) {
      candidate.constraints.push({ from, to }); out.push(candidate);
    }
  }
  for (const edgeIndex of flow.edges.map((e, i) => (e.from === id || e.to === id) && /^--+>$/.test(e.arrow) ? i : -1).filter(i => i >= 0).slice(0, 2)) {
    const candidate = structuredClone(base);
    if (candidate.edges[edgeIndex].arrow.length < 8) {
      candidate.edges[edgeIndex].arrow = '-' + candidate.edges[edgeIndex].arrow;
      out.push(candidate);
    }
  }
  return out.slice(0, 8);
}
