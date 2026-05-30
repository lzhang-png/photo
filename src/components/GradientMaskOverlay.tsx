import { useEffect, useRef } from "react";
import type { Geometry } from "../editor/geometry";
import {
  rotationRadians,
  screenToSourceNorm,
  sourceNormToScreen,
} from "../editor/geometry";
import type { LinearGradientMask } from "../editor/masks";
import type { DecodedImage } from "../editor/pipeline";

type DragMode = "p0" | "p1";

type Props = {
  image: DecodedImage;
  geometry: Geometry;
  viewW: number;
  viewH: number;
  masks: LinearGradientMask[];
  activeMaskId: string | null;
  interactive: boolean;
  onBeginEdit: () => void;
  onCommitEdit: () => void;
  onUpdateMask: (id: string, patch: Partial<LinearGradientMask>) => void;
  onSetActiveMask: (id: string) => void;
  onSelectMask?: (id: string) => void;
  onExitEdit?: () => void;
  onDeselect?: () => void;
};

const HANDLE_R = 8;
const HIT_R = 14;
const PILL_HALF_W = 14;
const ACCENT = "oklch(0.68 0.14 250)";

function maskGradientId(maskId: string) {
  return `mask-grad-${maskId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
}

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

function clampNorm(pt: { x: number; y: number }) {
  return { x: clamp01(pt.x), y: clamp01(pt.y) };
}

function dist(ax: number, ay: number, bx: number, by: number) {
  return Math.hypot(ax - bx, ay - by);
}

function capsulePath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  radius: number,
): string {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) {
    return `M ${x1 - radius} ${y1} a ${radius} ${radius} 0 1 0 ${radius * 2} 0 a ${radius} ${radius} 0 1 0 ${-radius * 2} 0`;
  }
  const nx = (-dy / len) * radius;
  const ny = (dx / len) * radius;
  return [
    `M ${x1 + nx} ${y1 + ny}`,
    `A ${radius} ${radius} 0 0 1 ${x1 - nx} ${y1 - ny}`,
    `L ${x2 - nx} ${y2 - ny}`,
    `A ${radius} ${radius} 0 0 1 ${x2 + nx} ${y2 + ny}`,
    "Z",
  ].join(" ");
}

export function GradientMaskOverlay({
  image,
  geometry,
  viewW,
  viewH,
  masks,
  activeMaskId,
  interactive,
  onBeginEdit,
  onCommitEdit,
  onUpdateMask,
  onSetActiveMask,
  onSelectMask,
  onExitEdit,
  onDeselect,
}: Props) {
  const overlayRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{
    mode: DragMode;
    maskId: string;
    startP0: { x: number; y: number };
    startP1: { x: number; y: number };
    startNorm: { x: number; y: number };
  } | null>(null);

  const angleRad = rotationRadians(geometry);
  const imgW = image.width;
  const imgH = image.height;
  const activeMask = masks.find((m) => m.id === activeMaskId) ?? null;

  const toNorm = (sx: number, sy: number) =>
    screenToSourceNorm(sx, sy, imgW, imgH, angleRad, viewW, viewH);

  const toScreen = (nx: number, ny: number) =>
    sourceNormToScreen(nx, ny, imgW, imgH, angleRad, viewW, viewH);

  const localFromClient = (clientX: number, clientY: number) => {
    const rect = overlayRef.current!.getBoundingClientRect();
    return { sx: clientX - rect.left, sy: clientY - rect.top };
  };

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || !overlayRef.current) return;

      const { sx, sy } = localFromClient(e.clientX, e.clientY);
      const norm = toNorm(sx, sy);
      const delta = {
        x: norm.x - drag.startNorm.x,
        y: norm.y - drag.startNorm.y,
      };

      if (drag.mode === "p0") {
        onUpdateMask(drag.maskId, {
          p0: clampNorm({
            x: drag.startP0.x + delta.x,
            y: drag.startP0.y + delta.y,
          }),
        });
        return;
      }

      onUpdateMask(drag.maskId, {
        p1: clampNorm({
          x: drag.startP1.x + delta.x,
          y: drag.startP1.y + delta.y,
        }),
      });
    };

    const onUp = () => {
      if (!dragRef.current) return;
      dragRef.current = null;
      onCommitEdit();
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [onCommitEdit, onUpdateMask, imgW, imgH, angleRad, viewW, viewH]);

  const startDrag = (
    mode: DragMode,
    maskId: string,
    mask: LinearGradientMask,
    sx: number,
    sy: number,
    e: React.PointerEvent,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    overlayRef.current?.setPointerCapture(e.pointerId);
    onBeginEdit();
    dragRef.current = {
      mode,
      maskId,
      startP0: { ...mask.p0 },
      startP1: { ...mask.p1 },
      startNorm: toNorm(sx, sy),
    };
  };

  const onHandlePointerDown = (
    maskId: string,
    mode: DragMode,
    e: React.PointerEvent,
    enterEdit = false,
  ) => {
    const mask = masks.find((item) => item.id === maskId);
    if (!mask) return;
    const { sx, sy } = localFromClient(e.clientX, e.clientY);
    if (enterEdit) {
      onSetActiveMask(maskId);
      onSelectMask?.(maskId);
    }
    startDrag(mode, maskId, mask, sx, sy, e);
  };

  const onRestingPointerDown = (maskId: string, e: React.PointerEvent) => {
    const mask = masks.find((item) => item.id === maskId);
    if (!mask) return;
    e.preventDefault();
    e.stopPropagation();

    const { sx, sy } = localFromClient(e.clientX, e.clientY);
    const p0 = toScreen(mask.p0.x, mask.p0.y);
    const p1 = toScreen(mask.p1.x, mask.p1.y);

    if (dist(sx, sy, p0.x, p0.y) <= HIT_R) {
      onHandlePointerDown(maskId, "p0", e, true);
      return;
    }
    if (dist(sx, sy, p1.x, p1.y) <= HIT_R) {
      onHandlePointerDown(maskId, "p1", e, true);
      return;
    }

    onSetActiveMask(maskId);
    onSelectMask?.(maskId);
  };

  return (
    <svg
      ref={overlayRef}
      className="pointer-events-none absolute inset-0 size-full"
      viewBox={`0 0 ${viewW} ${viewH}`}
      preserveAspectRatio="none"
    >
      <defs>
        <filter
          id="mask-pill-shadow"
          x="-40%"
          y="-40%"
          width="180%"
          height="180%"
        >
          <feDropShadow
            dx="0"
            dy="1"
            stdDeviation="3"
            floodColor="#000"
            floodOpacity="0.45"
          />
        </filter>
      </defs>
      {!interactive && (
        <rect
          width="100%"
          height="100%"
          fill="transparent"
          className="pointer-events-auto cursor-default"
          onPointerDown={() => onDeselect?.()}
        />
      )}
      {interactive && (
        <rect
          width="100%"
          height="100%"
          fill="transparent"
          className="pointer-events-auto cursor-default"
          onPointerDown={() => onExitEdit?.()}
        />
      )}
      {masks.map((m) => {
        const isEditing = interactive && m.id === activeMaskId;
        const isResting = !isEditing;
        const p0 = toScreen(m.p0.x, m.p0.y);
        const p1 = toScreen(m.p1.x, m.p1.y);
        const gradId = maskGradientId(m.id);
        const pillPath = capsulePath(p0.x, p0.y, p1.x, p1.y, PILL_HALF_W);
        const solidOpacity = isEditing ? 0.48 : 0.4;
        const fadeEndOpacity = isEditing ? 0.24 : 0.2;
        const groupOpacity = isResting && interactive ? 0.55 : 1;

        return (
          <g key={m.id} opacity={groupOpacity}>
            <defs>
              <linearGradient
                id={gradId}
                gradientUnits="userSpaceOnUse"
                x1={p0.x}
                y1={p0.y}
                x2={p1.x}
                y2={p1.y}
              >
                <stop offset="0%" stopColor={ACCENT} stopOpacity={solidOpacity} />
                <stop offset="100%" stopColor="white" stopOpacity={fadeEndOpacity} />
              </linearGradient>
            </defs>
            {isResting && (
              <path
                d={pillPath}
                fill="transparent"
                className="pointer-events-auto cursor-pointer"
                onPointerDown={(e) => onRestingPointerDown(m.id, e)}
              />
            )}
            <g filter="url(#mask-pill-shadow)" pointerEvents="none">
              <path
                d={pillPath}
                fill={`url(#${gradId})`}
                stroke="rgba(0,0,0,0.4)"
                strokeWidth={1.5}
              />
              {isEditing && (
                <>
                  <circle
                    cx={p0.x}
                    cy={p0.y}
                    r={HANDLE_R}
                    fill="white"
                    stroke="white"
                    strokeWidth={2}
                  />
                  <circle
                    cx={p1.x}
                    cy={p1.y}
                    r={HANDLE_R}
                    fill="rgba(0,0,0,0.15)"
                    stroke="white"
                    strokeWidth={2}
                    strokeDasharray="3 2"
                  />
                </>
              )}
            </g>
            {isEditing && activeMask && (
              <>
                <circle
                  cx={p0.x}
                  cy={p0.y}
                  r={HIT_R}
                  fill="transparent"
                  className="pointer-events-auto cursor-grab active:cursor-grabbing"
                  onPointerDown={(e) => onHandlePointerDown(activeMask.id, "p0", e)}
                />
                <circle
                  cx={p1.x}
                  cy={p1.y}
                  r={HIT_R}
                  fill="transparent"
                  className="pointer-events-auto cursor-grab active:cursor-grabbing"
                  onPointerDown={(e) => onHandlePointerDown(activeMask.id, "p1", e)}
                />
              </>
            )}
            {isResting && (
              <>
                <circle
                  cx={p0.x}
                  cy={p0.y}
                  r={HIT_R}
                  fill="transparent"
                  className="pointer-events-auto cursor-grab active:cursor-grabbing"
                  onPointerDown={(e) => onHandlePointerDown(m.id, "p0", e, true)}
                />
                <circle
                  cx={p1.x}
                  cy={p1.y}
                  r={HIT_R}
                  fill="transparent"
                  className="pointer-events-auto cursor-grab active:cursor-grabbing"
                  onPointerDown={(e) => onHandlePointerDown(m.id, "p1", e, true)}
                />
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}
