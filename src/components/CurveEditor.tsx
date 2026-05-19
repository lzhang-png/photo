import { useEffect, useRef } from "react";
import { buildCurveLUT } from "../editor/curve";

type Props = {
  points: [number, number, number, number];
  onChange: (pts: [number, number, number, number]) => void;
};

const SIZE = 200;

export function CurveEditor({ points, onChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<number | null>(null);

  // Anchors in normalized [0,1] x: 0, 1/3, 2/3, 1
  const xs: [number, number, number, number] = [0, 1 / 3, 2 / 3, 1];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const dpr = devicePixelRatio;
    canvas.width = SIZE * dpr;
    canvas.height = SIZE * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, SIZE, SIZE);

    // Grid.
    ctx.strokeStyle = "#2a2a2a";
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const v = (i / 4) * SIZE;
      ctx.beginPath();
      ctx.moveTo(v, 0);
      ctx.lineTo(v, SIZE);
      ctx.moveTo(0, v);
      ctx.lineTo(SIZE, v);
      ctx.stroke();
    }

    // Identity line.
    ctx.strokeStyle = "#333";
    ctx.beginPath();
    ctx.moveTo(0, SIZE);
    ctx.lineTo(SIZE, 0);
    ctx.stroke();

    // Curve via LUT.
    const lut = buildCurveLUT(points);
    ctx.strokeStyle = "#e6e6e6";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < 256; i++) {
      const x = (i / 255) * SIZE;
      const y = SIZE - (lut[i] / 255) * SIZE;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Anchors.
    for (let i = 0; i < 4; i++) {
      const x = xs[i] * SIZE;
      const y = SIZE - points[i] * SIZE;
      ctx.fillStyle = "#4aa3ff";
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [points]);

  const hitTest = (px: number, py: number) => {
    for (let i = 0; i < 4; i++) {
      const x = xs[i] * SIZE;
      const y = SIZE - points[i] * SIZE;
      if (Math.hypot(px - x, py - y) < 10) return i;
    }
    return null;
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const idx = hitTest(px, py);
    if (idx === null) return;
    dragRef.current = idx;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragRef.current === null) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const py = e.clientY - rect.top;
    const y = Math.max(0, Math.min(1, 1 - py / SIZE));
    const next = [...points] as [number, number, number, number];
    next[dragRef.current] = y;
    onChange(next);
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  return (
    <canvas
      ref={canvasRef}
      style={{ width: "100%", aspectRatio: "1 / 1", display: "block", borderRadius: 3 }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={() => onChange([0, 0.25, 0.75, 1])}
    />
  );
}
