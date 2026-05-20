import { useCallback, useEffect, useRef, useState } from "react";
import type { Geometry } from "../editor/geometry";
import { normalizeGeometry } from "../editor/geometry";
import type { DecodedImage } from "../editor/pipeline";

type Props = {
  image: DecodedImage;
  geometry: Geometry;
  onChange: (patch: Partial<Geometry>) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
};

type DragMode =
  | "move"
  | "nw"
  | "ne"
  | "sw"
  | "se"
  | "n"
  | "s"
  | "e"
  | "w";

type ImageRect = { ox: number; oy: number; dw: number; dh: number };

function imageRect(
  containerW: number,
  containerH: number,
  imgW: number,
  imgH: number,
): ImageRect {
  const scale = Math.min(containerW / imgW, containerH / imgH);
  const dw = imgW * scale;
  const dh = imgH * scale;
  return {
    ox: (containerW - dw) / 2,
    oy: (containerH - dh) / 2,
    dw,
    dh,
  };
}

function screenToNorm(
  clientX: number,
  clientY: number,
  rect: DOMRect,
  ir: ImageRect,
): { x: number; y: number } {
  const px = clientX - rect.left - ir.ox;
  const py = clientY - rect.top - ir.oy;
  return {
    x: Math.max(0, Math.min(1, px / ir.dw)),
    y: Math.max(0, Math.min(1, py / ir.dh)),
  };
}

export function TransformOverlay({
  image,
  geometry,
  onChange,
  containerRef,
}: Props) {
  const [layout, setLayout] = useState<{
    container: DOMRect;
    image: ImageRect;
  } | null>(null);
  const dragRef = useRef<{
    mode: DragMode;
    startGeom: Geometry;
    startX: number;
    startY: number;
  } | null>(null);

  const measure = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const container = el.getBoundingClientRect();
    const ir = imageRect(
      container.width,
      container.height,
      image.width,
      image.height,
    );
    setLayout({ container, image: ir });
  }, [containerRef, image.width, image.height]);

  useEffect(() => {
    measure();
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure, containerRef]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || !layout) return;
      const { x, y } = screenToNorm(
        e.clientX,
        e.clientY,
        layout.container,
        layout.image,
      );
      const dx = x - drag.startX;
      const dy = y - drag.startY;
      const g = drag.startGeom;
      let { cropX, cropY, cropW, cropH } = g;

      if (drag.mode === "move") {
        cropX = g.cropX + dx;
        cropY = g.cropY + dy;
      } else {
        if (drag.mode.includes("w")) {
          cropX = g.cropX + dx;
          cropW = g.cropW - dx;
        }
        if (drag.mode.includes("e")) {
          cropW = g.cropW + dx;
        }
        if (drag.mode.includes("n")) {
          cropY = g.cropY + dy;
          cropH = g.cropH - dy;
        }
        if (drag.mode.includes("s")) {
          cropH = g.cropH + dy;
        }
      }

      onChange(
        normalizeGeometry({ ...g, cropX, cropY, cropW, cropH }),
      );
    };

    const onUp = () => {
      dragRef.current = null;
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [layout, onChange]);

  if (!layout) return null;

  const { ox, oy, dw, dh } = layout.image;
  const left = ox + geometry.cropX * dw;
  const top = oy + geometry.cropY * dh;
  const width = geometry.cropW * dw;
  const height = geometry.cropH * dh;

  const startDrag = (mode: DragMode, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const { x, y } = screenToNorm(
      e.clientX,
      e.clientY,
      layout.container,
      layout.image,
    );
    dragRef.current = {
      mode,
      startGeom: { ...geometry },
      startX: x,
      startY: y,
    };
  };

  const handleSize = 14;

  return (
    <svg
      className="transform-overlay"
      width={layout.container.width}
      height={layout.container.height}
    >
      <defs>
        <mask id="crop-mask">
          <rect width="100%" height="100%" fill="white" />
          <rect
            x={left}
            y={top}
            width={width}
            height={height}
            fill="black"
          />
        </mask>
      </defs>
      <rect
        width="100%"
        height="100%"
        fill="rgba(0,0,0,0.45)"
        mask="url(#crop-mask)"
        pointerEvents="none"
      />
      <rect
        x={left}
        y={top}
        width={width}
        height={height}
        fill="none"
        stroke="oklch(0.68 0.14 250)"
        strokeWidth={2}
        pointerEvents="all"
        onPointerDown={(e) => startDrag("move", e)}
      />
      {(
        [
          ["nw", left, top],
          ["ne", left + width, top],
          ["sw", left, top + height],
          ["se", left + width, top + height],
          ["n", left + width / 2, top],
          ["s", left + width / 2, top + height],
          ["w", left, top + height / 2],
          ["e", left + width, top + height / 2],
        ] as const
      ).map(([mode, cx, cy]) => (
        <rect
          key={mode}
          x={cx - handleSize / 2}
          y={cy - handleSize / 2}
          width={handleSize}
          height={handleSize}
          className="crop-handle"
          onPointerDown={(e) => startDrag(mode, e)}
        />
      ))}
      <line
        x1={left + width / 3}
        y1={top}
        x2={left + width / 3}
        y2={top + height}
        stroke="rgba(255,255,255,0.35)"
        pointerEvents="none"
      />
      <line
        x1={left + (2 * width) / 3}
        y1={top}
        x2={left + (2 * width) / 3}
        y2={top + height}
        stroke="rgba(255,255,255,0.35)"
        pointerEvents="none"
      />
      <line
        x1={left}
        y1={top + height / 3}
        x2={left + width}
        y2={top + height / 3}
        stroke="rgba(255,255,255,0.35)"
        pointerEvents="none"
      />
      <line
        x1={left}
        y1={top + (2 * height) / 3}
        x2={left + width}
        y2={top + (2 * height) / 3}
        stroke="rgba(255,255,255,0.35)"
        pointerEvents="none"
      />
    </svg>
  );
}
