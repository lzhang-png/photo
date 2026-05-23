import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

const BINS = 128;
const SAMPLE_W = 256;
const HIST_W = 220;
const HIST_H = 90;

type HistogramData = {
  r: Uint32Array;
  g: Uint32Array;
  b: Uint32Array;
  l: Uint32Array;
  max: number;
};

function computeHistogram(
  source: HTMLCanvasElement,
): HistogramData | null {
  const sw = source.width;
  const sh = source.height;
  if (sw === 0 || sh === 0) return null;

  const scale = Math.min(1, SAMPLE_W / Math.max(sw, sh));
  const w = Math.max(1, Math.floor(sw * scale));
  const h = Math.max(1, Math.floor(sh * scale));

  const off = document.createElement("canvas");
  off.width = w;
  off.height = h;
  const ctx = off.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  try {
    ctx.drawImage(source, 0, 0, w, h);
  } catch {
    return null;
  }

  let data: ImageData;
  try {
    data = ctx.getImageData(0, 0, w, h);
  } catch {
    return null;
  }
  const px = data.data;

  const r = new Uint32Array(BINS);
  const g = new Uint32Array(BINS);
  const b = new Uint32Array(BINS);
  const l = new Uint32Array(BINS);
  const scaleBin = BINS / 256;

  for (let i = 0; i < px.length; i += 4) {
    const ri = Math.min(BINS - 1, (px[i] * scaleBin) | 0);
    const gi = Math.min(BINS - 1, (px[i + 1] * scaleBin) | 0);
    const bi = Math.min(BINS - 1, (px[i + 2] * scaleBin) | 0);
    const lum =
      0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
    const li = Math.min(BINS - 1, (lum * scaleBin) | 0);
    r[ri]++;
    g[gi]++;
    b[bi]++;
    l[li]++;
  }

  let max = 0;
  // Skip extreme bins so blown blacks/whites don't crush the scale.
  for (let i = 1; i < BINS - 1; i++) {
    if (r[i] > max) max = r[i];
    if (g[i] > max) max = g[i];
    if (b[i] > max) max = b[i];
  }
  if (max === 0) max = 1;

  return { r, g, b, l, max };
}

function drawHistogram(
  canvas: HTMLCanvasElement,
  hist: HistogramData,
): void {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (w === 0 || h === 0) return;
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);

  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  const max = hist.max;
  const binW = w / BINS;

  const drawChannel = (
    bins: Uint32Array,
    fill: string,
    op: GlobalCompositeOperation,
  ) => {
    ctx.globalCompositeOperation = op;
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let i = 0; i < BINS; i++) {
      const v = Math.min(1, bins[i] / max);
      const y = h - v * h;
      const x = i * binW;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
  };

  drawChannel(hist.r, "rgba(255, 80, 80, 0.85)", "lighter");
  drawChannel(hist.g, "rgba(80, 220, 110, 0.85)", "lighter");
  drawChannel(hist.b, "rgba(90, 140, 255, 0.85)", "lighter");

  ctx.globalCompositeOperation = "source-over";
}

type Props = {
  source: HTMLCanvasElement | null;
  /** Anything that should trigger a recompute (image, adjustments, …). */
  deps: unknown[];
  className?: string;
};

export function Histogram({ source, deps, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!source || !canvasRef.current) return;

    const compute = () => {
      rafRef.current = null;
      const target = canvasRef.current;
      if (!target) return;
      const hist = computeHistogram(source);
      if (!hist) return;
      drawHistogram(target, hist);
    };

    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(compute);

    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, ...deps]);

  return (
    <div
      className={cn(
        "rounded-md border border-border bg-black/70 p-1.5 shadow-md backdrop-blur-sm",
        className,
      )}
      style={{ width: HIST_W }}
    >
      <canvas
        ref={canvasRef}
        className="block w-full"
        style={{ height: HIST_H }}
      />
    </div>
  );
}
