import { parseFlow, serializeFlow, type Flow } from './flow.ts';
import type { Geometry, Point } from './layout';
import type { Rendered } from './render';
import { DragIndex, planDrop } from './drag-plan.ts';

export interface PreparedPreview { source: string; flow: Flow; rendered: Rendered }
export type PreviewState = 'waiting' | 'calculating' | 'ready' | 'unchanged' | 'error';
interface Options {
  flow: Flow; geometry: Geometry; id: string; source: string; minimum: number;
  render: (source: string, flow: Flow) => Promise<Rendered>;
  onState: (state: PreviewState, prepared?: PreparedPreview) => void;
  idleMs?: number; intervalMs?: number;
}
/** Una propuesta real tras una pausa, sin colas ni renderizados por pointermove. */
export class ExactDragPreview {
  visible: PreparedPreview | null = null;
  private options: Options;
  private index: DragIndex;
  private target: Point;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private revision = 0;
  private active = true;
  private inFlight = false;
  private movedAt = 0;
  private startedAt = -Infinity;
  private duration = 0;
  private state: PreviewState | undefined;
  private cache = new Map<string, PreparedPreview>();
  constructor(options: Options) {
    this.options = options;
    this.target = options.geometry.nodes[options.id];
    this.index = new DragIndex(options.flow, options.geometry, options.id);
  }
  update(target: Point): void {
    if (!this.active) return;
    this.target = target; this.revision++; this.movedAt = performance.now();
    if (this.timer) clearTimeout(this.timer);
    this.emit('waiting'); this.schedule();
  }
  get status(): PreviewState | undefined { return this.state; }
  stop(): void { this.active = false; if (this.timer) clearTimeout(this.timer); }
  private emit(state: PreviewState, prepared?: PreparedPreview) {
    if (!this.active) return;
    if (this.state === state && !prepared) return;
    this.state = state; this.options.onState(state, prepared);
  }
  private schedule() {
    if (!this.active || this.inFlight) return;
    const now = performance.now();
    const idle = (this.options.idleMs ?? 320) - (now - this.movedAt);
    // Como máximo dos renders por segundo; reducir más la frecuencia si el grafo cuesta mucho.
    const interval = this.options.intervalMs ?? Math.max(500, Math.min(1500, this.duration * 3));
    const budget = interval - (now - this.startedAt);
    this.timer = setTimeout(() => { this.timer = undefined; void this.evaluate(); }, Math.max(0, idle, budget));
  }
  private async evaluate() {
    if (!this.active || this.inFlight) return;
    const revision = this.revision, o = this.options;
    const next = planDrop(o.flow, o.geometry, o.id, this.index.snap(this.target, o.minimum).point, this.index, o.minimum);
    const source = next ? serializeFlow(next) : '';
    if (!next || source === o.source) { this.visible = null; this.emit('unchanged'); return; }
    const cached = this.cache.get(source);
    if (cached) { this.visible = cached; this.emit('ready', cached); return; }
    const parsed = parseFlow(source);
    if (!parsed.ok) { this.emit('error'); return; }
    this.inFlight = true; this.startedAt = performance.now(); this.emit('calculating');
    try {
      const rendered = await o.render(source, parsed.flow);
      if (!this.active) return;
      const prepared = { source, flow: parsed.flow, rendered };
      this.duration = performance.now() - this.startedAt;
      this.cache.set(source, prepared);
      // Caché pequeña y acotada; no retener variantes de diagramas grandes sin límite.
      while (this.cache.size > 4 || (this.cache.size > 1 && [...this.cache.values()].reduce((sum, p) => sum + p.rendered.svg.length * 2, 0) > 2_000_000)) this.cache.delete(this.cache.keys().next().value!);
      if (revision === this.revision) { this.visible = prepared; this.emit('ready', prepared); }
    } catch {
      if (this.active && revision === this.revision) this.emit('error');
    } finally {
      this.inFlight = false;
      if (this.active && revision !== this.revision) this.schedule();
    }
  }
}
