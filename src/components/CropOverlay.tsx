import { useEffect, useId, useRef, useState } from "react";
import type { Geometry, ScreenRect } from "../editor/geometry";
import {
  clampScreenRect,
  clampScreenRectPosition,
  clampSourceCropInBoundsPreserveAspect,
  constrainCropAspect,
  rotationRadians,
  screenRectToSourceCrop,
  sourceCropToScreenRect,
} from "../editor/geometry";
import {
  registerCropOverlaySync,
  setSessionScreenRect,
} from "../editor/transformSession";
import type { DecodedImage } from "../editor/pipeline";

type DragMode =
  | "pan"
  | "nw"
  | "ne"
  | "sw"
  | "se"
  | "n"
  | "s"
  | "e"
  | "w";

type Props = {
  image: DecodedImage;
  geometry: Geometry;
  viewW: number;
  viewH: number;
};

const MIN_SCREEN = 24;

function adjustScreenRect(
  start: ScreenRect,
  dx: number,
  dy: number,
  mode: DragMode,
): ScreenRect {
  let { x, y, w, h } = start;

  if (mode.includes("w")) {
    x += dx;
    w -= dx;
  }
  if (mode.includes("e")) w += dx;
  if (mode.includes("n")) {
    y += dy;
    h -= dy;
  }
  if (mode.includes("s")) h += dy;

  if (w < MIN_SCREEN) {
    if (mode.includes("w") && !mode.includes("e")) x += w - MIN_SCREEN;
    w = MIN_SCREEN;
  }
  if (h < MIN_SCREEN) {
    if (mode.includes("n") && !mode.includes("s")) y += h - MIN_SCREEN;
    h = MIN_SCREEN;
  }

  return { x, y, w, h };
}

function panPhotoRect(start: ScreenRect, dx: number, dy: number): ScreenRect {
  return { x: start.x + dx, y: start.y + dy, w: start.w, h: start.h };
}

export function CropOverlay({ image, geometry, viewW, viewH }: Props) {
  const [rect, setRect] = useState<ScreenRect | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const rectRef = useRef<ScreenRect | null>(null);
  const maskId = useId();
  const dragRef = useRef<{
    mode: DragMode;
    startGeom: Geometry;
    startRect: ScreenRect;
    startClientX: number;
    startClientY: number;
  } | null>(null);

  const angleRad = rotationRadians(geometry);
  const imgW = image.width;
  const imgH = image.height;

  useEffect(() => {
    return registerCropOverlaySync((next) => {
      rectRef.current = next;
      setRect(next);
    });
  }, []);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;

      const dx = e.clientX - drag.startClientX;
      const dy = e.clientY - drag.startClientY;

      if (drag.mode === "pan") {
        setSessionScreenRect(
          clampScreenRectPosition(
            panPhotoRect(drag.startRect, dx, dy),
            viewW,
            viewH,
          ),
        );
        return;
      }

      let next = adjustScreenRect(drag.startRect, dx, dy, drag.mode);
      const aspectLocked = drag.startGeom.aspectLocked;

      if (!aspectLocked) {
        next = clampScreenRect(next, viewW, viewH);
        setSessionScreenRect(next);
        return;
      }

      let { cropX, cropY, cropW, cropH } = screenRectToSourceCrop(
        next,
        imgW,
        imgH,
        angleRad,
        viewW,
        viewH,
      );
      const constrained = constrainCropAspect(
        drag.startGeom,
        cropX,
        cropY,
        cropW,
        cropH,
        drag.mode,
        imgW,
        imgH,
      );
      const clamped = clampSourceCropInBoundsPreserveAspect(
        constrained.cropX,
        constrained.cropY,
        constrained.cropW,
        constrained.cropH,
        drag.startGeom.lockedAspect,
        imgW,
        imgH,
        drag.mode,
      );
      next = clampScreenRectPosition(
        sourceCropToScreenRect(
          clamped,
          imgW,
          imgH,
          angleRad,
          viewW,
          viewH,
        ),
        viewW,
        viewH,
      );
      setSessionScreenRect(next);
    };

    const onUp = () => {
      dragRef.current = null;
      setIsPanning(false);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [viewW, viewH, imgW, imgH, angleRad]);

  if (!rect || rect.w < 1 || rect.h < 1) return null;

  const { x, y, w, h } = rect;
  const panCursor = isPanning ? "cursor-grabbing" : "cursor-grab";
  const handleSize = 12;
  const handleClass =
    "pointer-events-auto fill-white stroke-[oklch(0.68_0.14_250)] stroke-2 hover:fill-primary/20";

  const outsidePan: ScreenRect[] = [];
  if (y > 0) outsidePan.push({ x: 0, y: 0, w: viewW, h: y });
  if (y + h < viewH) outsidePan.push({ x: 0, y: y + h, w: viewW, h: viewH - y - h });
  if (x > 0) outsidePan.push({ x: 0, y, w: x, h });
  if (x + w < viewW) outsidePan.push({ x: x + w, y, w: viewW - x - w, h });

  const handles: Array<[DragMode, number, number, string]> = [
    ["nw", x, y, "cursor-nwse-resize"],
    ["ne", x + w, y, "cursor-nesw-resize"],
    ["se", x + w, y + h, "cursor-nwse-resize"],
    ["sw", x, y + h, "cursor-nesw-resize"],
    ["n", x + w / 2, y, "cursor-ns-resize"],
    ["s", x + w / 2, y + h, "cursor-ns-resize"],
    ["e", x + w, y + h / 2, "cursor-ew-resize"],
    ["w", x, y + h / 2, "cursor-ew-resize"],
  ];

  const startDrag = (mode: DragMode, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    if (mode === "pan") setIsPanning(true);
    dragRef.current = {
      mode,
      startGeom: { ...geometry },
      startRect: { ...rect },
      startClientX: e.clientX,
      startClientY: e.clientY,
    };
  };

  return (
    <svg
      className="pointer-events-none absolute inset-0 size-full"
      viewBox={`0 0 ${viewW} ${viewH}`}
      preserveAspectRatio="none"
    >
      <defs>
        <mask id={maskId}>
          <rect width="100%" height="100%" fill="white" />
          <rect x={x} y={y} width={w} height={h} fill="black" />
        </mask>
      </defs>
      <rect
        width="100%"
        height="100%"
        fill="rgba(0,0,0,0.45)"
        mask={`url(#${maskId})`}
        pointerEvents="none"
      />
      {outsidePan.map((zone, i) => (
        <rect
          key={`outside-${i}`}
          x={zone.x}
          y={zone.y}
          width={zone.w}
          height={zone.h}
          fill="transparent"
          className={`pointer-events-auto ${panCursor}`}
          onPointerDown={(e) => startDrag("pan", e)}
        />
      ))}
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        fill="transparent"
        className={`pointer-events-auto ${panCursor}`}
        onPointerDown={(e) => startDrag("pan", e)}
      />
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        fill="none"
        stroke="oklch(0.68 0.14 250)"
        strokeWidth={2}
        pointerEvents="none"
      />
      {handles.map(([mode, cx, cy, cursor]) => (
        <rect
          key={mode}
          x={cx - handleSize / 2}
          y={cy - handleSize / 2}
          width={handleSize}
          height={handleSize}
          rx={2}
          className={`${handleClass} ${cursor}`}
          onPointerDown={(e) => startDrag(mode, e)}
        />
      ))}
      {[
        [x + w / 3, y, x + w / 3, y + h],
        [x + (2 * w) / 3, y, x + (2 * w) / 3, y + h],
        [x, y + h / 3, x + w, y + h / 3],
        [x, y + (2 * h) / 3, x + w, y + (2 * h) / 3],
      ].map(([x1, y1, x2, y2], i) => (
        <line
          key={i}
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke="rgba(255,255,255,0.35)"
          pointerEvents="none"
        />
      ))}
    </svg>
  );
}
