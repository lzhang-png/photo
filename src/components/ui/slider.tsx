import { Slider as SliderPrimitive } from "@base-ui/react/slider"

import { cn } from "@/lib/utils"

const ADJUSTMENT_THUMB_PX = 16
const ADJUSTMENT_THUMB_HALF = ADJUSTMENT_THUMB_PX / 2

/** Map a 0–100 value percent to an inset-aware horizontal position. */
function insetPosition(percent: number) {
  return `calc(${ADJUSTMENT_THUMB_HALF}px + ${percent} * (100% - ${ADJUSTMENT_THUMB_PX}px) / 100)`
}

type SliderProps = SliderPrimitive.Root.Props & {
  /** Value the filled range extends from (defaults to 0 for bipolar sliders). */
  pivotValue?: number;
  /** Visual style for sidebar adjustment controls. */
  variant?: "default" | "adjustment";
};

function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  pivotValue,
  variant = "default",
  ...props
}: SliderProps) {
  const _values = Array.isArray(value)
    ? value
    : Array.isArray(defaultValue)
      ? defaultValue
      : [min, max]

  const current = _values[0] ?? min;
  const range = max - min;
  const toPct = (v: number) => (range === 0 ? 0 : ((v - min) / range) * 100);
  const pivot =
    pivotValue ?? (min < 0 && max > 0 ? 0 : min);
  const thumbPct = toPct(current);
  const pivotPct = toPct(pivot);
  const fillLeftPct = Math.min(pivotPct, thumbPct);
  const fillWidthPct = Math.abs(thumbPct - pivotPct);
  const centerFill = min < 0 && max > 0;
  const isAdjustment = variant === "adjustment";

  return (
    <SliderPrimitive.Root
      className={cn("data-horizontal:w-full data-vertical:h-full", className)}
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      thumbAlignment="edge"
      {...props}
    >
      <SliderPrimitive.Control
        className={cn(
          "relative flex w-full touch-none items-center select-none data-disabled:opacity-50 data-vertical:h-full data-vertical:min-h-40 data-vertical:w-auto data-vertical:flex-col",
          isAdjustment ? "h-4 overflow-visible" : "overflow-visible py-2",
        )}
      >
        <SliderPrimitive.Track
          data-slot="slider-track"
          className={cn(
            "relative grow overflow-hidden rounded-full select-none data-vertical:h-full data-vertical:w-2",
            isAdjustment
              ? "h-1 w-full bg-secondary"
              : "bg-muted data-horizontal:h-2 data-horizontal:w-full",
          )}
        >
          {centerFill ? (
            <div
              aria-hidden
              className="absolute top-0 h-full rounded-full bg-primary"
              style={{
                left: insetPosition(fillLeftPct),
                width: `calc(${fillWidthPct} * (100% - ${ADJUSTMENT_THUMB_PX}px) / 100)`,
              }}
            />
          ) : (
            <SliderPrimitive.Indicator
              data-slot="slider-range"
              className="bg-primary select-none data-horizontal:h-full data-vertical:w-full"
            />
          )}
        </SliderPrimitive.Track>
        {centerFill && (
          <div
            aria-hidden
            className="pointer-events-none absolute top-1/2 z-[1] h-2 w-px -translate-x-1/2 -translate-y-1/2 bg-border"
            style={{ left: insetPosition(pivotPct) }}
          />
        )}
        {Array.from({ length: _values.length }, (_, index) => (
          <SliderPrimitive.Thumb
            data-slot="slider-thumb"
            key={index}
            className={cn(
              "relative z-[2] block shrink-0 rounded-full border select-none disabled:pointer-events-none disabled:opacity-50",
              isAdjustment
                ? "size-4 border-border bg-foreground shadow-[0_1px_3px_rgba(0,0,0,0.4)] after:absolute after:-inset-2 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-hidden"
                : "size-5 border-ring bg-white ring-ring/50 transition-[color,box-shadow] after:absolute after:-inset-4 hover:ring-3 focus-visible:ring-3 focus-visible:outline-hidden active:ring-3",
            )}
          />
        ))}
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  )
}

export { Slider }
