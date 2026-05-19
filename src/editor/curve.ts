// Build a 256-entry 1D LUT from four control points.
// Inputs are normalized 0..1 y-values for x = 0, 1/3, 2/3, 1.
// Uses Catmull-Rom interpolation, then clamps to monotonic range.
export function buildCurveLUT(pts: [number, number, number, number]): Uint8Array {
  const lut = new Uint8Array(256);
  const xs = [0, 1 / 3, 2 / 3, 1];
  const ys = pts;

  for (let i = 0; i < 256; i++) {
    const x = i / 255;
    let y: number;

    if (x <= xs[1]) {
      const t = (x - xs[0]) / (xs[1] - xs[0]);
      y = hermite(ys[0], ys[0], ys[1], ys[2], t);
    } else if (x <= xs[2]) {
      const t = (x - xs[1]) / (xs[2] - xs[1]);
      y = hermite(ys[0], ys[1], ys[2], ys[3], t);
    } else {
      const t = (x - xs[2]) / (xs[3] - xs[2]);
      y = hermite(ys[1], ys[2], ys[3], ys[3], t);
    }

    lut[i] = Math.max(0, Math.min(255, Math.round(y * 255)));
  }
  return lut;
}

// Catmull-Rom on 4 points, t in [0,1] between p1 and p2.
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
