import type { Point } from './layout';
export type Positions = Record<string, Point>;
export const manualLayoutTag = '%% mermaid-bp:manual-layout';
export function hasManualLayout(source: string): boolean {
  return source.replace(/^\uFEFF/, '').split(/\r?\n/).find(line => line.trim())?.trim() === manualLayoutTag;
}
export function tagManualLayout(source: string): string {
  if (hasManualLayout(source)) return source;
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  return manualLayoutTag + newline + source.replace(/^\uFEFF/, '');
}
const prefix = '%% graph:positions ';
export function readPositions(source: string): Positions {
  const result: Positions = Object.create(null);
  for (const line of source.split(/\r?\n/)) {
    if (!line.trimStart().startsWith(prefix)) continue;
    try {
      const entries = JSON.parse(line.trimStart().slice(prefix.length));
      if (!entries || typeof entries !== 'object' || Array.isArray(entries)) continue;
      for (const [id, p] of Object.entries(entries)) {
        const point = p as Point;
        if (point && Number.isFinite(point.x) && Number.isFinite(point.y) && Math.abs(point.x) < 1e7 && Math.abs(point.y) < 1e7)
          result[id] = { x: point.x, y: point.y };
      }
    } catch { /* Un comentario incompleto no impide editar Mermaid. */ }
  }
  return result;
}
export function writePositions(source: string, positions: Positions): string {
  source = tagManualLayout(source);
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  const entries = Object.fromEntries(Object.entries(positions).map(([id, p]) =>
    [id, { x: p.x, y: p.y }]));
  const line = prefix + JSON.stringify(entries);
  const lines = source.split(/\r?\n/);
  const existing = lines.findIndex(text => text.trimStart().startsWith(prefix));
  if (existing >= 0) {
    lines[existing] = line;
    return lines.filter((text, index) => index === existing || !text.trimStart().startsWith(prefix)).join(newline);
  }
  return source + (source.endsWith('\n') ? '' : newline) + line + newline;
}
