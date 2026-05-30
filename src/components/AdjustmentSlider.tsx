import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { SliderResetSlot } from "@/components/SliderResetSlot";
import type { SliderSpec } from "@/editor/adjustments";
import { DEFAULT_ADJUSTMENTS } from "@/editor/adjustments";

type Props = {
  spec: SliderSpec;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
};

export function AdjustmentSlider({ spec, value, onChange, disabled }: Props) {
  const def = DEFAULT_ADJUSTMENTS[spec.key] as number;
  const atDefault = value === def;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-h-8 items-center gap-2">
        <Label className="min-w-0 flex-1 text-[13px] font-normal leading-normal text-muted-foreground">
          {spec.label}
        </Label>
        <div className="flex shrink-0 items-center justify-end gap-1.5">
          <span className="text-right text-xs font-medium tabular-nums leading-[1.3] text-foreground">
            {formatValue(value, spec)}
          </span>
          <SliderResetSlot
            visible={!atDefault}
            disabled={disabled}
            onClick={() => onChange(def)}
          />
        </div>
      </div>
      <Slider
        variant="adjustment"
        min={spec.min}
        max={spec.max}
        step={spec.step}
        value={[value]}
        pivotValue={def}
        disabled={disabled}
        onValueChange={(v) => {
          const n = Array.isArray(v) ? v[0] : v;
          if (n !== undefined) onChange(n);
        }}
        onDoubleClick={() => onChange(def)}
      />
    </div>
  );
}

function formatValue(v: number, spec: SliderSpec) {
  if (spec.key === "exposure") {
    if (v === 0) return "0";
    return `${v >= 0 ? "+" : ""}${v.toFixed(2)}`;
  }
  const n = Math.round(v * 100);
  if (n === 0) return "0";
  return n > 0 ? `+${n}` : String(n);
}
