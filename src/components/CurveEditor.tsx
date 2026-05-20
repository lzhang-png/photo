import { useEffect, useRef } from "react";
import {
  buildCurveLUT,
  clampPointX,
  DEFAULT_CURVE,
  evaluateCurve,
  insertPointOnCurve,
  removePoint,
  type CurvePoint,
} from "../editor/curve";

type Props = {
  points: CurvePoint[];
  onChange: (pts: CurvePoint[]) => void;
};

const SIZE = 200;

export function CurveEditor({ points, onChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<number | null>(null);

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

    // Control points.
    const sorted = [...points].sort((a, b) => a.x - b.x);
    for (let i = 0; i < sorted.length; i++) {
      const { x, y } = sorted[i];
      const px = x * SIZE;
      const py = SIZE - y * SIZE;
      const isEnd = i === 0 || i === sorted.length - 1;
      ctx.fillStyle = isEnd ? "#7eb6ff" : "#4aa3ff";
      ctx.beginPath();
      ctx.arc(px, py, isEnd ? 5 : 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [points]);

  const toLocal = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = SIZE / rect.width;
    const sy = SIZE / rect.height;
    return {
      px: (e.clientX - rect.left) * sx,
      py: (e.clientY - rect.top) * sy,
    };
  };

  const hitTest = (px: number, py: number) => {
    for (let i = 0; i < points.length; i++) {
      const x = points[i].x * SIZE;
      const y = SIZE - points[i].y * SIZE;
      if (Math.hypot(px - x, py - y) < 10) return i;
    }
    return null;
  };

  const commit = (next: CurvePoint[]) =>
    onChange([...next].sort((a, b) => a.x - b.x));

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { px, py } = toLocal(e);
    const idx = hitTest(px, py);
    if (idx !== null) {
      dragRef.current = idx;
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }

    // Click empty area: add a point on the curve.
    const x = Math.max(0, Math.min(1, px / SIZE));
    const y = evaluateCurve(points, x);
    commit(insertPointOnCurve(points, x, y));
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragRef.current === null) return;
    const { px, py } = toLocal(e);
    const idx = dragRef.current;
    const isStart = idx === 0;
    const isEnd = idx === points.length - 1;

    let x = Math.max(0, Math.min(1, px / SIZE));
    let y = Math.max(0, Math.min(1, 1 - py / SIZE));

    if (isStart) x = 0;
    else if (isEnd) x = 1;
    else x = clampPointX(points, idx, x);

    const next = points.map((p, i) => (i === idx ? { x, y } : { ...p }));
    onChange(next);
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  const onDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { px, py } = (() => {
      const rect = e.currentTarget.getBoundingClientRect();
      const sx = SIZE / rect.width;
      const sy = SIZE / rect.height;
      return {
        px: (e.clientX - rect.left) * sx,
        py: (e.clientY - rect.top) * sy,
      };
    })();

    const idx = hitTest(px, py);
    if (idx !== null && idx > 0 && idx < points.length - 1) {
      commit(removePoint(points, idx));
      return;
    }

    commit(DEFAULT_CURVE.map((p) => ({ ...p })));
  };

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: "100%",
        aspectRatio: "1 / 1",
        display: "block",
        borderRadius: 3,
        touchAction: "none",
        cursor: "crosshair",
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={onDoubleClick}
    />
  );
}
