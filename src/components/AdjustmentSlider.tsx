import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import type { SliderSpec } from "@/editor/adjustments";
import { DEFAULT_ADJUSTMENTS } from "@/editor/adjustments";

type Props = {
  spec: SliderSpec;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
};

export function AdjustmentSlider({ spec, value, onChange, disabled }: Props) {
  const def = DEFAULT_ADJUSTMENTS[spec.key];
  const display = formatValue(value, spec);
  const atDefault = value === def;

  return (
    <div className="space-y-2">
      <div className="flex min-h-8 items-center justify-between gap-2">
        <Label className="font-normal text-foreground">{spec.label}</Label>
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "shrink-0 text-right tabular-nums text-muted-foreground",
              spec.key === "exposure" ? "min-w-[4.5rem]" : "min-w-[2rem]",
            )}
          >
            {display}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className={cn(
              "shrink-0 text-muted-foreground",
              atDefault && "pointer-events-none opacity-0",
            )}
            title="Reset"
            disabled={disabled || atDefault}
            tabIndex={atDefault ? -1 : 0}
            aria-hidden={atDefault}
            onClick={() => onChange(def as number)}
          >
            <RotateCcw className="size-4" />
          </Button>
        </div>
      </div>
      <Slider
        min={spec.min}
        max={spec.max}
        step={spec.step}
        value={[value]}
        disabled={disabled}
        onValueChange={(v) => {
          const n = Array.isArray(v) ? v[0] : v;
          if (n !== undefined) onChange(n);
        }}
        onDoubleClick={() => onChange(def as number)}
      />
    </div>
  );
}

function formatValue(v: number, spec: SliderSpec) {
  if (spec.key === "exposure") return `${v >= 0 ? "+" : ""}${v.toFixed(2)} EV`;
  return Math.round(v * 100).toString();
}
