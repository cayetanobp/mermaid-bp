export type Shape = 'rect' | 'round' | 'diamond' | 'circle' | 'stadium';
export type Direction = 'TD' | 'TB' | 'BT' | 'LR' | 'RL';
export interface FlowGroup { id:string; label:string; parent?:string }
export interface FlowNode { id: string; label: string; shape: Shape; group?: string }
export interface FlowEdge { from: string; to: string; label: string; arrow: string; key?: string }
interface Ref { id: string; start: number; end: number; explicit: boolean }
interface SourceLine {
  raw: string;
  kind: 'raw' | 'header' | 'content' | 'class' | 'style' | 'layout';
  scope: string;
  refs?: Ref[];
  edges?: string[];
  classIds?: string[];
}
interface Snapshot {
  direction: Direction;
  nodes: FlowNode[];
  edges: FlowEdge[];
  comments: string[];
  groups?: FlowGroup[];
  constraints: Array<{ from: string; to: string }>;
}
interface FlowSource { text: string; newline: string; lines: SourceLine[]; original: Snapshot }
export interface Flow extends Snapshot { source?: FlowSource }
export type Parsed = { ok: true; flow: Flow } | { ok: false; reason: string };
const idPattern = /^[A-Za-z_][A-Za-z0-9_]*/;
const begin = '%% mbp-layout:start';
const end = '%% mbp-layout:end';
const pairs: Array<[string, string, Shape]> = [['((', '))', 'circle'], ['([', '])', 'stadium'], ['[', ']', 'rect'], ['(', ')', 'round'], ['{', '}', 'diamond']];
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const snapshot = (flow: Flow): Snapshot => ({ direction: flow.direction, nodes: flow.nodes, edges: flow.edges, comments: flow.comments, constraints: flow.constraints, groups:flow.groups ?? [] });

export function encodeLabel(label: string): string {
  return label.replace(/[&#"<>]/g, char => ({ '&': '#38;', '#': '#35;', '"': '#quot;', '<': '#60;', '>': '#62;' })[char]!).replace(/\r?\n/g, '<br/>');
}
export function decodeLabel(label: string): string {
  return label.replace(/<br\s*\/?\s*>/gi, '\n').replace(/#quot;/g, '"')
    .replace(/#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}
function readRef(text: string): { node: FlowNode; length: number; explicit: boolean } {
  const match = text.match(idPattern);
  if (!match || ['end', 'subgraph'].includes(match[0])) throw new Error('Identificador no admitido en edición visual.');
  const id = match[0];
  let rest = text.slice(id.length).trimStart();
  for (const [open, close, shape] of pairs) {
    if (!rest.startsWith(open)) continue;
    rest = rest.slice(open.length);
    let label: string;
    if (rest.startsWith('"')) {
      const finish = rest.indexOf('"', 1);
      if (finish < 0 || !rest.slice(finish + 1).startsWith(close)) throw new Error('Etiqueta no admitida.');
      label = rest.slice(1, finish);
      rest = rest.slice(finish + 1 + close.length);
    } else {
      const finish = rest.indexOf(close);
      if (finish < 0) throw new Error('Forma incompleta.');
      label = rest.slice(0, finish);
      if (/[\[\]{}()";<>]/.test(label)) throw new Error('Forma o etiqueta avanzada.');
      rest = rest.slice(finish + close.length);
    }
    if (/[`]/.test(label) || /<(?!br\s*\/?\s*>)/i.test(label) || /#(?!quot;)[a-z]+;/i.test(label)) throw new Error('Formato avanzado en la etiqueta.');
    return { node: { id, label: decodeLabel(label), shape }, length: text.length - rest.length, explicit: true };
  }
  return { node: { id, label: id, shape: 'rect' }, length: id.length, explicit: false };
}

export function parseFlow(source: string): Parsed {
  try {
    const rawLines = source.split(/\r?\n/);
    const flow: Flow = { direction: 'TD', nodes: [], edges: [], comments: [], constraints: [], groups:[] };
    const records: SourceLine[] = [];
    const nodes = new Map<string, FlowNode>(), explicit = new Set<string>(), groups = new Set<string>();
    const stack: string[] = [];
    let header = false, managed = false;
    const add = (ref: ReturnType<typeof readRef>) => {
      const old = nodes.get(ref.node.id), group = stack.join('/');
      if (ref.explicit && explicit.has(ref.node.id) && old && (old.label !== ref.node.label || old.shape !== ref.node.shape || (old.group ?? '') !== group)) {
        throw new Error('Hay declaraciones distintas para el mismo nodo.');
      }
      if (!old || ref.explicit) nodes.set(ref.node.id, group ? { ...ref.node, group } : ref.node);
      if (ref.explicit) explicit.add(ref.node.id);
    };
    for (const [lineIndex, raw] of rawLines.entries()) {
      const line = raw.replace(/^\uFEFF/, '').trim();
      const record: SourceLine = { raw, kind: 'raw', scope: stack.join('/') };
      if (line === begin) {
        if (managed || stack.length) throw new Error('Bloque de distribución fuera de lugar.');
        managed = true; record.kind = 'layout'; records.push(record); continue;
      }
      if (line === end) { if (!managed) throw new Error('Bloque de distribución incompleto.'); managed = false; continue; }
      if (managed) {
        const constraint = line.match(/^([A-Za-z_][\w]*)\s*~~~\s*([A-Za-z_][\w]*)$/);
        if (!constraint) throw new Error('Restricción de distribución desconocida.');
        flow.constraints.push({ from: constraint[1], to: constraint[2] }); continue;
      }
      records.push(record);
      if (!line) continue;
      if (line.startsWith('%%')) {
        if (line.startsWith('%%{')) {
          const init = line.match(/^%%\{\s*(?:init|initialize)\s*:\s*(\{.*\})\s*\}%%$/);
          if (!init || !JSON.parse(init[1]) || header) throw new Error('Directiva avanzada no admitida visualmente.');
        } else flow.comments.push(raw);
        continue;
      }
      if (!header) {
        const match = line.match(/^(?:flowchart|graph)\s+(TD|TB|BT|LR|RL)\s*;?$/);
        if (!match) throw new Error('La edición visual admite diagramas flowchart y graph.');
        flow.direction = match[1] as Direction; header = true; record.kind = 'header'; continue;
      }
      if (line.startsWith('subgraph ')) {
        const match = line.match(/^subgraph\s+([A-Za-z_][\w]*)(?:\s*\[\s*(?:"[^"\r\n]*"|[^\[\]"\r\n]+)\s*\])?\s*$/);
        if (!match || groups.has(match[1])) throw new Error('Subgráfico avanzado o identificador duplicado.');
        const title=line.slice(line.indexOf(match[1])+match[1].length).trim();
        flow.groups!.push({id:match[1],label:decodeLabel(title.startsWith('[')?title.slice(1,-1).trim().replace(/^"|"$/g,''):match[1]),...(stack.length?{parent:stack.at(-1)}:{})});
        groups.add(match[1]); stack.push(match[1]); continue;
      }
      if (line === 'end' || line === 'end;') { if (!stack.length) throw new Error('Cierre de subgráfico sin apertura.'); stack.pop(); continue; }
      if (/^direction\s+(TD|TB|BT|LR|RL)\s*;?$/.test(line) && stack.length) continue;
      if (/^classDef\s+[A-Za-z_][\w]*(?:,[A-Za-z_][\w]*)*\s+[^\r\n]+$/.test(line)) continue;
      const classes = line.match(/^class\s+([A-Za-z_][\w]*(?:\s*,\s*[A-Za-z_][\w]*)*)\s+([A-Za-z_][\w]*(?:,[A-Za-z_][\w]*)*)\s*;?$/);
      if (classes) { record.kind = 'class'; record.classIds = classes[1].split(/\s*,\s*/); continue; }
      const style = line.match(/^style\s+([A-Za-z_][\w]*)\s+[^\r\n]+$/);
      if (style) { record.kind = 'style'; record.classIds = [style[1]]; continue; }
      record.kind = 'content'; record.refs = []; record.edges = [];
      // Los rangos se refieren a la línea original, incluidos sus espacios.
      let cursor = raw.search(/\S/);
      const read = () => {
        const ref = readRef(raw.slice(cursor)); add(ref);
        record.refs!.push({ id: ref.node.id, start: cursor, end: cursor + ref.length, explicit: ref.explicit });
        cursor += ref.length;
        return ref;
      };
      let left = read();
      const whitespace = () => { while (/\s/.test(raw[cursor] ?? '') && cursor < raw.length) cursor++; };
      whitespace();
      while (cursor < raw.length && raw.slice(cursor).trim() !== ';') {
        const arrow = raw.slice(cursor).match(/^(--+>|---+|-\.->)\s*/);
        if (!arrow) throw new Error('Esta construcción necesita edición por código.');
        cursor += arrow[0].length;
        let label = '';
        if (raw[cursor] === '|') {
          const finish = raw.indexOf('|', cursor + 1);
          if (finish < 0) throw new Error('Etiqueta de conexión incompleta.');
          label = raw.slice(cursor + 1, finish);
          if (label.startsWith('"') && label.endsWith('"')) label = label.slice(1, -1);
          if (/[<>`"\r\n]/.test(label) || /#(?!quot;)[a-z]+;/i.test(label)) throw new Error('Etiqueta de conexión avanzada.');
          label = decodeLabel(label); cursor = finish + 1; whitespace();
        }
        const right = read();
        const key = `e${lineIndex}_${record.edges.length}`;
        flow.edges.push({ from: left.node.id, to: right.node.id, arrow: arrow[1], label, key });
        record.edges.push(key); left = right; whitespace();
      }
    }
    if (!header || managed || stack.length) throw new Error('Diagrama incompleto.');
    flow.nodes = [...nodes.values()];
    if (flow.nodes.some(n => groups.has(n.id))) throw new Error('Las conexiones a subgráficos requieren edición por código.');
    if (flow.constraints.some(c => !nodes.has(c.from) || !nodes.has(c.to))) throw new Error('Restricción con nodos inexistentes.');
    flow.source = { text: source, newline: source.includes('\r\n') ? '\r\n' : '\n', lines: records, original: structuredClone(snapshot(flow)) };
    return { ok: true, flow };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'Sintaxis avanzada.' };
  }
}
function nodeText(node: FlowNode): string {
  const [open, close] = pairs.find(p => p[2] === node.shape)!;
  return `${node.id}${open}"${encodeLabel(node.label)}"${close}`;
}
function edgeText(edge: FlowEdge): string {
  const label = edge.label ? `|"${encodeLabel(edge.label).replace(/\|/g, '#124;')}"|` : '';
  return `${edge.from} ${edge.arrow}${label} ${edge.to}`;
}
function constraintLines(flow: Flow): string[] {
  return flow.constraints.length ? [begin, ...flow.constraints.map(c => `${c.from} ~~~ ${c.to}`), end] : [];
}
function serializeGroups(flow:Flow):string {
  const source=flow.source,groups=flow.groups ?? [],byScope=new Map<string,string[]>();
  const alive=new Set(groups.map(g=>g.id));
  for(const line of source?.lines ?? []) {
    if(line.kind==='content'||line.kind==='layout'||/^\s*(?:subgraph\b|end\s*;?\s*$)/.test(line.raw))continue;
    if(line.kind==='style'&&line.classIds?.some(id=>source!.original.groups?.some(g=>g.id===id)&&!alive.has(id)))continue;
    const ids=line.scope.split('/').filter(Boolean);
    while(ids.length&&!alive.has(ids.at(-1)!))ids.pop();
    const scope=ids.at(-1) ?? '',lines=byScope.get(scope) ?? [];
    lines.push(line.kind==='header'?line.raw.replace(/((?:flowchart|graph)\s+)(TD|TB|BT|LR|RL)/,'$1'+flow.direction):line.raw);byScope.set(scope,lines);
  }
  const out=byScope.get('') ?? [...flow.comments,'flowchart '+flow.direction];
  const emit=(id:string)=>{
    const group=groups.find(g=>g.id===id)!;
    out.push('subgraph '+group.id+'["'+encodeLabel(group.label)+'"]',...(byScope.get(id) ?? []));
    for(const n of flow.nodes.filter(n=>n.group?.split('/').at(-1)===id))out.push('    '+nodeText(n));
    for(const child of groups.filter(g=>g.parent===id))emit(child.id);
    out.push('end');
  };
  for(const n of flow.nodes.filter(n=>!n.group))out.push('    '+nodeText(n));
  for(const group of groups.filter(g=>!g.parent))emit(group.id);
  out.push(...flow.edges.map(edgeText),...constraintLines(flow),'');
  return out.join(source?.newline ?? '\n');
}

export function serializeFlow(flow: Flow): string {
  const source = flow.source;
  if ((!source && flow.groups?.length) || (source && (!same(flow.groups ?? [],source.original.groups ?? []) || flow.nodes.some(n=>(n.group ?? '')!==(source.original.nodes.find(old=>old.id===n.id)?.group ?? '')))))return serializeGroups(flow);
  if (!source) {
    return [...flow.comments, `flowchart ${flow.direction}`, ...flow.nodes.map(n => `    ${nodeText(n)}`), ...flow.edges.map(e => `    ${edgeText(e)}`), ...constraintLines(flow), ''].join('\n');
  }
  if (same(snapshot(flow), source.original)) return source.text;
  const current = new Map(flow.nodes.map(n => [n.id, n]));
  const previous = new Map(source.original.nodes.map(n => [n.id, n]));
  const edges = new Map(flow.edges.filter(e => e.key).map(e => [e.key!, e]));
  const oldEdges = new Map(source.original.edges.map(e => [e.key!, e]));
  const deleted = new Set(source.original.nodes.filter(n => !current.has(n.id)).map(n => n.id));
  const explicitIds = new Set(source.lines.flatMap(line => line.refs?.filter(r => r.explicit).map(r => r.id) ?? []));
  const firstRef = new Map<string, Ref>();
  for (const line of source.lines) for (const ref of line.refs ?? []) if (!firstRef.has(ref.id)) firstRef.set(ref.id, ref);
  const pure = source.lines.filter(line => line.kind === 'content' && !line.edges?.length && line.refs?.length === 1);
  const pureById = new Map(pure.map(line => [line.refs![0].id, line]));
  const reordered = !same(flow.nodes.filter(n => previous.has(n.id)).map(n => n.id), source.original.nodes.filter(n => current.has(n.id)).map(n => n.id));
  const queues = new Map<string, SourceLine[]>();
  if (reordered) {
    for (const n of flow.nodes) {
      const line = pureById.get(n.id); if (!line) continue;
      const queue = queues.get(line.scope) ?? []; queue.push(line); queues.set(line.scope, queue);
    }
  }
  const out: string[] = [];
  let hadLayout = false;
  for (const slot of source.lines) {
    let line = slot;
    if (reordered && pure.includes(slot)) {
      // Los nodos solo cambian de orden dentro de su propio subgráfico.
      const replacement = queues.get(slot.scope)?.shift();
      if (!replacement) continue;
      line = replacement;
    }
    if (line.kind === 'layout') { out.push(...constraintLines(flow)); hadLayout = true; continue; }
    if (line.kind === 'header') { out.push(line.raw.replace(/((?:flowchart|graph)\s+)(TD|TB|BT|LR|RL)/, `$1${flow.direction}`)); continue; }
    if ((line.kind === 'class' || line.kind === 'style') && line.classIds?.some(id => deleted.has(id))) {
      const ids = line.classIds.filter(id => !deleted.has(id));
      if (ids.length) out.push(line.kind === 'class' ? line.raw.replace(/(class\s+)[A-Za-z_][\w]*(?:\s*,\s*[A-Za-z_][\w]*)*/, `$1${ids.join(',')}`) : line.raw);
      continue;
    }
    if (line.kind !== 'content') { out.push(line.raw); continue; }
    const refs = line.refs!, keys = line.edges!;
    const edgeChanged = keys.some(key => !same(edges.get(key), oldEdges.get(key)));
    const hasDeletedNode = refs.some(ref => deleted.has(ref.id));
    const indent = line.raw.match(/^\s*/)?.[0] ?? '';
    if (edgeChanged || hasDeletedNode) {
      // Una cadena afectada se expande localmente; las otras líneas quedan intactas.
      const seen = new Set<string>();
      for (const ref of refs) {
        const n = current.get(ref.id);
        if (n && !seen.has(n.id)) { out.push(indent + (ref.explicit || !explicitIds.has(n.id) ? nodeText(n) : n.id)); seen.add(n.id); }
      }
      for (const key of keys) { const e = edges.get(key); if (e) out.push(indent + edgeText(e)); }
      continue;
    }
    let raw = line.raw;
    for (const ref of [...refs].reverse()) {
      const node = current.get(ref.id)!;
      if (!same(node, previous.get(ref.id)) && (ref.explicit || (!explicitIds.has(ref.id) && firstRef.get(ref.id) === ref))) {
        raw = raw.slice(0, ref.start) + nodeText(node) + raw.slice(ref.end);
      }
    }
    out.push(raw);
  }
  const additions = [
    ...flow.nodes.filter(n => !previous.has(n.id)).map(n => `    ${nodeText(n)}`),
    ...flow.edges.filter(e => !e.key || !oldEdges.has(e.key)).map(e => `    ${edgeText(e)}`),
    ...(!hadLayout ? constraintLines(flow) : []),
  ];
  if (additions.length) { if (out.at(-1) !== '') out.push(''); out.push(...additions, ''); }
  return out.join(source.newline);
}
export function nextId(flow: Flow): string {
  let n = 1;
  const reserved = new Set(flow.source?.lines.flatMap(l => l.classIds ?? []) ?? []);
  while (flow.nodes.some(node => node.id === `N${n}`) || reserved.has(`N${n}`)) n++;
  return `N${n}`;
}
export function removeNode(flow: Flow, id: string): void {
  flow.nodes = flow.nodes.filter(n => n.id !== id);
  flow.edges = flow.edges.filter(e => e.from !== id && e.to !== id);
  flow.constraints = flow.constraints.filter(c => c.from !== id && c.to !== id);
}
/** Relaciona cada trazo con su conexión, incluidos los bucles de uno o tres trazos. */
export function edgePathMap(flow: Flow): Map<string, number> {
  const paths = new Map<string, number>(), counts = new Map<string, number>();
  const ambiguous = new Set<string>();
  const add = (id: string, index: number) => { if (paths.has(id)) ambiguous.add(id); else paths.set(id, index); };
  flow.edges.forEach((edge, index) => {
    const pair = `${edge.from}_${edge.to}`, count = counts.get(pair) ?? 0;
    add(`L_${pair}_${count === 0 ? 0 : count + 1}`, index); counts.set(pair, count + 1);
    // Mermaid reciente usa un solo trazo para bucles; conservar también los tres de versiones anteriores.
    if (edge.from === edge.to) {
      for (const suffix of ['1', 'mid', '2']) add(`${edge.from}-cyclic-special-${suffix}`, index);
    }
  });
  for (const id of ambiguous) paths.delete(id);
  return paths;
}
export const example = `flowchart TD
    Inicio(["Inicio"])
    Editar["Editar el diagrama"]
    Revisar{"¿Está listo?"}
    Guardar(["Guardar archivo"])
    Inicio --> Editar
    Editar --> Revisar
    Revisar -->|"Sí"| Guardar
    Revisar -->|"Todavía no"| Editar
`;
