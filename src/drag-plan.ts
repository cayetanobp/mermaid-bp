import type { Flow } from './flow';
import type { Geometry, Point } from './layout';
interface Entry extends Point { id: string }
export interface Snap { point: Point; guideX: number | null; guideY: number | null }
const squared = (a: Point, b: Point) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
function lowerBound(items: Entry[], value: number, axis: 'x' | 'y'): number {
  let lo = 0, hi = items.length;
  while (lo < hi) { const mid = (lo + hi) >>> 1; if (items[mid][axis] < value) lo = mid + 1; else hi = mid; }
  return lo;
}
/** Índices ordenados una vez; cada consulta inspecciona un máximo de diez vecinos. */
export class DragIndex {
  readonly byX: Entry[];
  readonly byY: Entry[];
  readonly pitch: number;
  constructor(flow: Flow, geometry: Geometry, id: string) {
    const group = flow.nodes.find(node => node.id === id)?.group ?? '';
    const entries = flow.nodes.filter(node => node.id !== id && (node.group ?? '') === group && geometry.nodes[node.id])
      .map(node => ({ id: node.id, ...geometry.nodes[node.id] }));
    this.byX = [...entries].sort((a, b) => a.x - b.x);
    this.byY = [...entries].sort((a, b) => a.y - b.y);
    const axis = flow.direction === 'LR' || flow.direction === 'RL' ? 'x' : 'y';
    const ordered = [...entries, { id, ...geometry.nodes[id] }].sort((a, b) => a[axis] - b[axis]);
    const gaps = ordered.slice(1).map((p, i) => p[axis] - ordered[i][axis]).filter(gap => gap > 20).sort((a, b) => a - b);
    this.pitch = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 100;
  }
  neighbors(target: Point): Entry[] {
    const found = new Map<string, Entry>();
    for (const axis of ['x', 'y'] as const) {
      const items = axis === 'x' ? this.byX : this.byY, index = lowerBound(items, target[axis], axis);
      for (let j = Math.max(0, index - 2); j < Math.min(items.length, index + 3); j++) found.set(items[j].id, items[j]);
    }
    return [...found.values()];
  }
  snap(target: Point, tolerance: number): Snap {
    const nearest = (axis: 'x' | 'y') => {
      const items = axis === 'x' ? this.byX : this.byY, i = lowerBound(items, target[axis], axis);
      const a = items[i - 1], b = items[i];
      const p = !a ? b : !b ? a : Math.abs(a[axis] - target[axis]) < Math.abs(b[axis] - target[axis]) ? a : b;
      return p && Math.abs(p[axis] - target[axis]) <= tolerance ? p[axis] : null;
    };
    const guideX = nearest('x'), guideY = nearest('y');
    return { point: { x: guideX ?? target.x, y: guideY ?? target.y }, guideX, guideY };
  }
}
function reaches(flow: Flow, from: string, to: string): boolean {
  const edges = new Map<string, string[]>();
  for (const edge of [...flow.edges, ...flow.constraints]) { const list = edges.get(edge.from) ?? []; list.push(edge.to); edges.set(edge.from, list); }
  const stack = [from], visited = new Set<string>();
  while (stack.length) {
    const id = stack.pop()!; if (id === to) return true; if (visited.has(id)) continue;
    visited.add(id); stack.push(...(edges.get(id) ?? []));
  }
  return false;
}
/** Una decisión determinista al soltar; nunca llama a Mermaid ni prueba varias distribuciones. */
export function planDrop(flow: Flow, geometry: Geometry, id: string, target: Point, index: DragIndex, minimum = 8): Flow | null {
  const origin = geometry.nodes[id]; if (!origin || squared(origin, target) < minimum * minimum) return null;
  const horizontal = flow.direction === 'LR' || flow.direction === 'RL';
  const axis = horizontal ? 'x' : 'y', cross = horizontal ? 'y' : 'x';
  const sign = flow.direction === 'RL' || flow.direction === 'BT' ? -1 : 1;
  const delta = (target[axis] - origin[axis]) * sign;
  const neighbors = index.neighbors(target).sort((a, b) => squared(a, target) - squared(b, target));
  // Separación en el sentido del flujo, proporcional al espacio solicitado.
  if (Math.abs(delta) > Math.max(minimum, index.pitch * .2) && Math.abs(delta) >= Math.abs(target[cross] - origin[cross]) * .65) {
    const incoming = flow.edges.findIndex(edge => edge.to === id && edge.from !== id && /^--+>$/.test(edge.arrow));
    const outgoing = flow.edges.findIndex(edge => edge.from === id && edge.to !== id && /^--+>$/.test(edge.arrow));
    const steps = Math.max(1, Math.min(4, Math.round(Math.abs(delta) / index.pitch)));
    let edgeIndex = -1, length = 0;
    if (delta > 0 && incoming >= 0) { edgeIndex = incoming; length = Math.min(8, flow.edges[incoming].arrow.length - 1 + steps); }
    else if (delta < 0 && incoming >= 0 && flow.edges[incoming].arrow.length > 3) { edgeIndex = incoming; length = Math.max(2, flow.edges[incoming].arrow.length - 1 - steps); }
    else if (delta < 0 && outgoing >= 0) { edgeIndex = outgoing; length = Math.min(8, flow.edges[outgoing].arrow.length - 1 + steps); }
    else if (delta > 0 && outgoing >= 0 && flow.edges[outgoing].arrow.length > 3) { edgeIndex = outgoing; length = Math.max(2, flow.edges[outgoing].arrow.length - 1 - steps); }
    if (edgeIndex >= 0 && flow.edges[edgeIndex].arrow !== '-'.repeat(length) + '>') {
      const next = structuredClone(flow); next.edges[edgeIndex].arrow = '-'.repeat(length) + '>'; return next;
    }
  }
  const neighbor = neighbors[0]; if (!neighbor) return null;
  const at = flow.nodes.findIndex(node => node.id === id);
  const sideAxis = Math.abs(target[cross] - origin[cross]) > Math.abs(delta) ? cross : axis;
  const before = target[sideAxis] < neighbor[sideAxis];
  const order = flow.nodes.map(node => node.id); order.splice(at, 1);
  order.splice(order.indexOf(neighbor.id) + (before ? 0 : 1), 0, id);
  if (order.some((key, i) => key !== flow.nodes[i].id)) {
    const next = structuredClone(flow), nodeMap = new Map(next.nodes.map(node => [node.id, node]));
    next.nodes = order.map(key => nodeMap.get(key)!); return next;
  }
  // Una restricción invisible, únicamente cuando no introduce un ciclo nuevo.
  const earlier = (target[axis] < neighbor[axis]) === (sign > 0);
  const from = earlier ? id : neighbor.id, to = earlier ? neighbor.id : id;
  if (!flow.edges.some(edge => edge.from === from && edge.to === to) && !flow.constraints.some(edge => edge.from === from && edge.to === to) && !reaches(flow, to, from)) {
    const next = structuredClone(flow);
    next.constraints = next.constraints.filter(edge => edge.from !== id && edge.to !== id);
    next.constraints.push({ from, to }); return next;
  }
  return null;
}
