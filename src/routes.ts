import type { Point } from './layout';
const distance = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);
/** Redondea las esquinas de una polilínea sin buscar una distribución global. */
export function roundedPath(points: Point[], radius = 18): string {
  if (!points.length) return '';
  let out = `M${points[0].x},${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i-1], b = points[i], c = points[i+1];
    const ab = distance(a,b), bc = distance(b,c), r = Math.min(radius, ab/2, bc/2);
    if (r < 0.01) { out += ` L${b.x},${b.y}`; continue; }
    const before = { x:b.x+(a.x-b.x)*r/ab, y:b.y+(a.y-b.y)*r/ab };
    const after = { x:b.x+(c.x-b.x)*r/bc, y:b.y+(c.y-b.y)*r/bc };
    out += ` L${before.x},${before.y} Q${b.x},${b.y} ${after.x},${after.y}`;
  }
  const end = points.at(-1)!;
  return out + ` L${end.x},${end.y}`;
}
export function anchor(center: Point, width: number, height: number, shape: string, angle: number): Point {
  const theta = angle * Math.PI / 180, x = Math.cos(theta), y = Math.sin(theta);
  const w = Math.max(1, width/2), h = Math.max(1, height/2);
  let r = 1 / Math.max(Math.abs(x)/w, Math.abs(y)/h);
  if (shape === 'stadium' || shape === 'round') {
    const corner = shape === 'stadium' ? Math.min(w,h) : Math.min(5,w,h);
    const px=x*r,py=y*r;
    if(Math.abs(px)>w-corner && Math.abs(py)>h-corner) {
      const cx=Math.sign(x)*(w-corner),cy=Math.sign(y)*(h-corner),dot=x*cx+y*cy;
      r=dot+Math.sqrt(Math.max(0,dot*dot-cx*cx-cy*cy+corner*corner));
    }
  }
  if (shape === 'circle') r = 1 / Math.sqrt(x*x/(w*w)+y*y/(h*h));
  else if (shape === 'diamond') r = 1 / (Math.abs(x)/w+Math.abs(y)/h);
  return { x:center.x+x*r, y:center.y+y*r };
}
