export type CurvePoint = { x: number; y: number };

/** Identity curve — no tone adjustment until the user edits it. */
export const DEFAULT_CURVE: CurvePoint[] = [
  { x: 0, y: 0 },
  { x: 1, y: 1 },
];

const MIN_X_GAP = 0.04;

/** Build a 256-entry 1D LUT from control points (Catmull-Rom, sorted by x). */
export function buildCurveLUT(points: CurvePoint[]): Uint8Array {
  const pts = [...points].sort((a, b) => a.x - b.x);
  const lut = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    const y = evaluateCurve(pts, i / 255);
    lut[i] = Math.max(0, Math.min(255, Math.round(y * 255)));
  }
  return lut;
}

export function evaluateCurve(points: CurvePoint[], x: number): number {
  const pts = [...points].sort((a, b) => a.x - b.x);
  if (pts.length === 0) return x;
  if (x <= pts[0].x) return pts[0].y;
  if (x >= pts[pts.length - 1].x) return pts[pts.length - 1].y;

  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (x < a.x || x > b.x) continue;
    if (a.x === b.x) return a.y;
    const t = (x - a.x) / (b.x - a.x);
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = a;
    const p2 = b;
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    return hermite(p0.y, p1.y, p2.y, p3.y, t);
  }
  return pts[pts.length - 1].y;
}

// Catmull-Rom on four y-values; t in [0,1] between p1 and p2.
function hermite(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}

export function clampPointX(
  points: CurvePoint[],
  index: number,
  x: number,
): number {
  const lo = index === 0 ? 0 : points[index - 1].x + MIN_X_GAP;
  const hi =
    index === points.length - 1 ? 1 : points[index + 1].x - MIN_X_GAP;
  return Math.max(lo, Math.min(hi, x));
}

export function insertPointOnCurve(
  points: CurvePoint[],
  x: number,
  y: number,
): CurvePoint[] {
  const clampedX = Math.max(MIN_X_GAP, Math.min(1 - MIN_X_GAP, x));
  const clampedY = Math.max(0, Math.min(1, y));
  const next = [...points, { x: clampedX, y: clampedY }].sort(
    (a, b) => a.x - b.x,
  );
  return next;
}

export function removePoint(points: CurvePoint[], index: number): CurvePoint[] {
  if (index <= 0 || index >= points.length - 1) return points;
  return points.filter((_, i) => i !== index);
}
