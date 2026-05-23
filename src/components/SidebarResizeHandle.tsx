import { useRef } from "react";
import { cn } from "@/lib/utils";

type Props = {
  width: number;
  min: number;
  max: number;
  onWidthChange: (width: number) => void;
  onWidthCommit: (width: number) => void;
};

function clamp(width: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(width)));
}

export function SidebarResizeHandle({
  width,
  min,
  max,
  onWidthChange,
  onWidthCommit,
}: Props) {
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const latestWidth = useRef(width);
  latestWidth.current = width;

  const endDrag = (target: HTMLElement, pointerId: number) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    target.releasePointerCapture(pointerId);
    onWidthCommit(latestWidth.current);
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize adjustment panel"
      aria-valuenow={width}
      aria-valuemin={min}
      aria-valuemax={max}
      className={cn(
        "absolute inset-y-0 -left-1 z-10 w-2 cursor-col-resize touch-none",
        "before:absolute before:inset-y-0 before:left-1/2 before:w-px before:-translate-x-1/2 before:bg-border",
        "hover:before:bg-primary/50 active:before:bg-primary",
      )}
      onPointerDown={(e) => {
        e.preventDefault();
        dragRef.current = { startX: e.clientX, startWidth: width };
        e.currentTarget.setPointerCapture(e.pointerId);
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
      }}
      onPointerMove={(e) => {
        if (!dragRef.current) return;
        const delta = e.clientX - dragRef.current.startX;
        const next = clamp(dragRef.current.startWidth - delta, min, max);
        latestWidth.current = next;
        onWidthChange(next);
      }}
      onPointerUp={(e) => endDrag(e.currentTarget, e.pointerId)}
      onPointerCancel={(e) => endDrag(e.currentTarget, e.pointerId)}
    />
  );
}
