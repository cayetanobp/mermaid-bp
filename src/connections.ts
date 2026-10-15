import { tagManualLayout } from './positions.ts';
export interface ConnectionPorts { from?: number; to?: number; bendFrom?: {x:number;y:number}; bendTo?: {x:number;y:number} }
export type Connections = Record<string, ConnectionPorts>;
const prefix = '%% graph:connections ';
export function readConnections(source: string): Connections {
  const result: Connections = Object.create(null);
  for (const line of source.split(/\r?\n/)) {
    if (!line.trimStart().startsWith(prefix)) continue;
    try {
      const value = JSON.parse(line.trimStart().slice(prefix.length));
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
      for (const [key, ports] of Object.entries(value)) {
        if (!ports || typeof ports !== 'object') continue;
        const entry: ConnectionPorts = {};
        for (const end of ['from', 'to'] as const) {
          const angle = (ports as ConnectionPorts)[end];
          if (typeof angle === 'number' && Number.isFinite(angle)) entry[end] = ((angle % 360) + 360) % 360;
        }
        for(const end of ['bendFrom','bendTo'] as const) {
          const point=(ports as ConnectionPorts)[end];
          if(point && Number.isFinite(point.x) && Number.isFinite(point.y) && Math.abs(point.x)<1e7 && Math.abs(point.y)<1e7) entry[end]={x:point.x,y:point.y};
        }
        if (Object.keys(entry).length) result[key] = entry;
      }
    } catch { /* Mantener editable el código con un comentario incompleto. */ }
  }
  return result;
}
export function writeConnections(source: string, connections: Connections): string {
  source = tagManualLayout(source);
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  const lines = source.split(/\r?\n/), text = prefix + JSON.stringify(connections);
  const index = lines.findIndex(line => line.trimStart().startsWith(prefix));
  if (index < 0) return source + (source.endsWith('\n') ? '' : newline) + text + newline;
  lines[index] = text;
  return lines.filter((line, i) => i === index || !line.trimStart().startsWith(prefix)).join(newline);
}
export function connectionKey(edges: Array<{from: string; to: string}>, index: number): string {
  const edge = edges[index];
  const ordinal = edges.slice(0, index).filter(e => e.from === edge.from && e.to === edge.to).length;
  return edge.from + '>' + edge.to + '#' + ordinal;
}
