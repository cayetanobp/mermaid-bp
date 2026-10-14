export type Shape = 'rect' | 'round' | 'diamond' | 'circle' | 'stadium';
export type Direction = 'TD' | 'TB' | 'BT' | 'LR' | 'RL';
export interface FlowNode { id: string; label: string; shape: Shape }
export interface FlowEdge { from: string; to: string; label: string; arrow: string }
export interface Flow {
  direction: Direction;
  nodes: FlowNode[];
  edges: FlowEdge[];
  comments: string[];
  constraints: Array<{ from: string; to: string }>;
}
export type Parsed = { ok: true; flow: Flow } | { ok: false; reason: string };
const idPattern = /^[A-Za-z_][A-Za-z0-9_]*/;
const begin = '%% mbp-layout:start';
const end = '%% mbp-layout:end';
const pairs: Array<[string, string, Shape]> = [['((', '))', 'circle'], ['([', '])', 'stadium'], ['[', ']', 'rect'], ['(', ')', 'round'], ['{', '}', 'diamond']];

export function encodeLabel(label: string): string {
  return label.replace(/[&#"<>]/g, char => ({ '&': '#38;', '#': '#35;', '"': '#quot;', '<': '#60;', '>': '#62;' })[char]!).replace(/\r?\n/g, '<br/>');
}
export function decodeLabel(label: string): string {
  return label.replace(/<br\s*\/?\s*>/gi, '\n').replace(/#quot;/g, '"')
    .replace(/#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}
function readRef(text: string): { node: FlowNode; rest: string; explicit: boolean } {
  const match = text.match(idPattern);
  if (!match || match[0].toLowerCase() === 'end') throw new Error('Identificador no admitido en edición visual.');
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
    if (/[`]/.test(label) || /<(?!br\s*\/?\s*>)/i.test(label)) throw new Error('Formato avanzado en la etiqueta.');
    return { node: { id, label: decodeLabel(label), shape }, rest: rest.trim(), explicit: true };
  }
  return { node: { id, label: id, shape: 'rect' }, rest: rest.trim(), explicit: false };
}

export function parseFlow(source: string): Parsed {
  try {
    const lines = source.replace(/^\uFEFF/, '').split(/\r?\n/);
    const flow: Flow = { direction: 'TD', nodes: [], edges: [], comments: [], constraints: [] };
    const nodes = new Map<string, FlowNode>();
    const explicit = new Set<string>();
    let header = false;
    let managed = false;
    const add = (ref: ReturnType<typeof readRef>) => {
      const old = nodes.get(ref.node.id);
      if (ref.explicit && explicit.has(ref.node.id) && old && (old.label !== ref.node.label || old.shape !== ref.node.shape)) {
        throw new Error('Hay declaraciones distintas para el mismo nodo.');
      }
      if (!old || ref.explicit) nodes.set(ref.node.id, ref.node);
      if (ref.explicit) explicit.add(ref.node.id);
    };
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      if (line === begin) { if (managed) throw new Error('Bloque de distribución duplicado.'); managed = true; continue; }
      if (line === end) { if (!managed) throw new Error('Bloque de distribución incompleto.'); managed = false; continue; }
      if (managed) {
        const constraint = line.match(/^([A-Za-z_][\w]*)\s*~~~\s*([A-Za-z_][\w]*)$/);
        if (!constraint) throw new Error('Restricción de distribución desconocida.');
        flow.constraints.push({ from: constraint[1], to: constraint[2] });
        continue;
      }
      if (line.startsWith('%%')) {
        if (line.startsWith('%%{')) throw new Error('Configuración avanzada.');
        flow.comments.push(raw); continue;
      }
      if (!header) {
        const match = line.match(/^(?:flowchart|graph)\s+(TD|TB|BT|LR|RL)\s*;?$/);
        if (!match) throw new Error('La edición visual admite flowchart y graph básicos.');
        flow.direction = match[1] as Direction; header = true; continue;
      }
      const left = readRef(line); add(left);
      if (!left.rest) continue;
      const arrow = left.rest.match(/^(--+>|---+|-\.->)\s*/);
      if (!arrow) throw new Error('Esta construcción necesita edición por código.');
      let tail = left.rest.slice(arrow[0].length);
      let label = '';
      if (tail.startsWith('|')) {
        const finish = tail.indexOf('|', 1);
        if (finish < 0) throw new Error('Etiqueta de conexión incompleta.');
        label = tail.slice(1, finish);
        if (label.startsWith('"') && label.endsWith('"')) label = label.slice(1, -1);
        if (/[<>`"\r\n]/.test(label)) throw new Error('Etiqueta de conexión avanzada.');
        label = decodeLabel(label);
        tail = tail.slice(finish + 1).trim();
      }
      const right = readRef(tail); add(right);
      if (right.rest) throw new Error('Conexiones encadenadas o construcciones avanzadas.');
      flow.edges.push({ from: left.node.id, to: right.node.id, arrow: arrow[1], label });
    }
    if (!header || managed) throw new Error('Diagrama incompleto.');
    flow.nodes = [...nodes.values()];
    if (flow.constraints.some(c => !nodes.has(c.from) || !nodes.has(c.to))) throw new Error('Restricción con nodos inexistentes.');
    return { ok: true, flow };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'Sintaxis avanzada.' };
  }
}

export function serializeFlow(flow: Flow): string {
  const lines = [...flow.comments, `flowchart ${flow.direction}`];
  for (const node of flow.nodes) {
    const [open, close] = pairs.find(p => p[2] === node.shape)!;
    lines.push(`    ${node.id}${open}"${encodeLabel(node.label)}"${close}`);
  }
  for (const edge of flow.edges) {
    const label = edge.label ? `|"${encodeLabel(edge.label).replace(/\|/g, '#124;')}"|` : '';
    lines.push(`    ${edge.from} ${edge.arrow}${label} ${edge.to}`);
  }
  if (flow.constraints.length) {
    lines.push('', begin, ...flow.constraints.map(c => `${c.from} ~~~ ${c.to}`), end);
  }
  return `${lines.join('\n')}\n`;
}
export function nextId(flow: Flow): string {
  let n = 1;
  while (flow.nodes.some(node => node.id === `N${n}`)) n++;
  return `N${n}`;
}
export function removeNode(flow: Flow, id: string): void {
  flow.nodes = flow.nodes.filter(n => n.id !== id);
  flow.edges = flow.edges.filter(e => e.from !== id && e.to !== id);
  flow.constraints = flow.constraints.filter(c => c.from !== id && c.to !== id);
}
export const example = `flowchart TD
    Inicio(["Inicio"])
    Editar["Editar el diagrama"]
    Revisar{"¿Está listo?"}
    Guardar(["Guardar en BookStack"])
    Inicio --> Editar
    Editar --> Revisar
    Revisar -->|"Sí"| Guardar
    Revisar -->|"Todavía no"| Editar
`;
