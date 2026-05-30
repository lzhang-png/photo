import { ChevronDown, Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import { AdjustmentSlider } from "@/components/AdjustmentSlider";
import { SidebarSection } from "@/components/SidebarSection";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { SliderResetSlot } from "@/components/SliderResetSlot";
import {
  COLOR_SLIDERS,
  TONE_SLIDERS,
} from "../editor/adjustments";
import {
  MAX_LINEAR_MASKS,
  DEFAULT_LINEAR_MASK_FEATHER,
  type ColorMaskDeltas,
  type LinearGradientMask,
  type ToneMaskDeltas,
} from "../editor/masks";
import {
  selectAdjustments,
  selectImage,
  useEditor,
} from "../state/store";
import { cn } from "@/lib/utils";

function MaskAdjustmentDrawer({
  mask,
  disabled,
  onUpdateMask,
  onSetAdjustment,
}: {
  mask: LinearGradientMask;
  disabled: boolean;
  onUpdateMask: (patch: Partial<LinearGradientMask>) => void;
  onSetAdjustment: (
    scope: "light" | "color",
    key: keyof ToneMaskDeltas | keyof ColorMaskDeltas,
    value: number,
  ) => void;
}) {
  return (
    <div className="space-y-4 bg-muted/25 px-3 py-3">
      <div className="flex flex-col gap-2">
        <div className="flex min-h-8 items-center gap-2">
          <Label className="min-w-0 flex-1 text-[13px] font-normal text-muted-foreground">
            Feather
          </Label>
          <div className="flex shrink-0 items-center gap-1.5">
            <span className="text-xs font-medium tabular-nums text-foreground">
              {Math.round(mask.feather * 100)}%
            </span>
            <SliderResetSlot
              visible={mask.feather !== DEFAULT_LINEAR_MASK_FEATHER}
              disabled={disabled}
              onClick={() => onUpdateMask({ feather: DEFAULT_LINEAR_MASK_FEATHER })}
            />
          </div>
        </div>
        <Slider
          variant="adjustment"
          min={0.02}
          max={0.5}
          step={0.01}
          value={[mask.feather]}
          pivotValue={DEFAULT_LINEAR_MASK_FEATHER}
          disabled={disabled}
          onValueChange={(v) => {
            const n = Array.isArray(v) ? v[0] : v;
            if (n !== undefined) onUpdateMask({ feather: n });
          }}
          onDoubleClick={() => onUpdateMask({ feather: DEFAULT_LINEAR_MASK_FEATHER })}
        />
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="shrink-0 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Light
          </span>
          <Separator className="flex-1" />
        </div>
        <div className="space-y-3">
          {TONE_SLIDERS.map((spec) => {
            const key = spec.key as keyof ToneMaskDeltas;
            return (
              <AdjustmentSlider
                key={spec.key}
                spec={spec}
                value={mask.light[key]}
                disabled={disabled}
                onChange={(v) => onSetAdjustment("light", key, v)}
              />
            );
          })}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="shrink-0 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Color
          </span>
          <Separator className="flex-1" />
        </div>
        <div className="space-y-3">
          {COLOR_SLIDERS.map((spec) => {
            const key = spec.key as keyof ColorMaskDeltas;
            return (
              <AdjustmentSlider
                key={spec.key}
                spec={spec}
                value={mask.color[key]}
                disabled={disabled}
                onChange={(v) => onSetAdjustment("color", key, v)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function MasksPanel() {
  const disabled = !useEditor(selectImage);
  const adj = useEditor(selectAdjustments);
  const activeMaskId = useEditor((s) => s.activeMaskId);
  const setActiveMaskId = useEditor((s) => s.setActiveMaskId);
  const setMaskEditing = useEditor((s) => s.setMaskEditing);
  const addLinearMask = useEditor((s) => s.addLinearMask);
  const removeLinearMask = useEditor((s) => s.removeLinearMask);
  const updateLinearMask = useEditor((s) => s.updateLinearMask);
  const setLinearMaskAdjustment = useEditor((s) => s.setLinearMaskAdjustment);
  const showMaskOverlayVisible = useEditor((s) => s.showMaskOverlay);
  const toggleShowMaskOverlay = useEditor((s) => s.toggleShowMaskOverlay);

  const masks = adj.linearMasks;

  const toggleMask = (id: string) => {
    if (activeMaskId === id) {
      setActiveMaskId(null);
      setMaskEditing(false);
      return;
    }
    setActiveMaskId(id);
    setMaskEditing(true);
  };

  return (
    <SidebarSection
      title="Local Adjustments"
      hint="Linear gradient masks for localized light and color. Drag on the photo to draw a gradient from A to B."
    >
      <div className="space-y-4">
        {masks.length > 0 && (
          <Button
            type="button"
            variant="outline"
            className="h-9 min-h-9 w-full justify-start gap-2"
            disabled={disabled}
            onClick={() => toggleShowMaskOverlay()}
          >
            {showMaskOverlayVisible ? (
              <EyeOff className="size-4 shrink-0" />
            ) : (
              <Eye className="size-4 shrink-0" />
            )}
            {showMaskOverlayVisible
              ? "Hide controls on canvas"
              : "Show controls on canvas"}
          </Button>
        )}

        {masks.length > 0 && (
          <ul className="space-y-1">
            {masks.map((m) => {
              const expanded = activeMaskId === m.id;
              return (
                <li key={m.id}>
                  <Collapsible open={expanded}>
                    <div
                      className={cn(
                        "overflow-hidden rounded-md border border-transparent",
                        expanded && "border-primary/40 bg-primary/5",
                      )}
                    >
                      <div
                        role="button"
                        tabIndex={disabled ? -1 : 0}
                        aria-expanded={expanded}
                        className={cn(
                          "flex cursor-pointer items-center gap-2 px-2 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                          disabled && "cursor-not-allowed opacity-50",
                        )}
                        onClick={() => !disabled && toggleMask(m.id)}
                        onKeyDown={(e) => {
                          if (disabled) return;
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            toggleMask(m.id);
                          }
                        }}
                      >
                        <div
                          className="shrink-0"
                          onClick={(e) => e.stopPropagation()}
                          onPointerDown={(e) => e.stopPropagation()}
                        >
                          <Checkbox
                            id={`mask-${m.id}`}
                            checked={m.enabled}
                            disabled={disabled}
                            onCheckedChange={(checked) =>
                              updateLinearMask(m.id, { enabled: checked === true })
                            }
                          />
                        </div>
                        <ChevronDown
                          className={cn(
                            "size-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
                            !expanded && "-rotate-90",
                          )}
                        />
                        <span className="min-w-0 flex-1 truncate text-left text-sm text-foreground">
                          {m.name}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="shrink-0 text-muted-foreground hover:text-destructive"
                          disabled={disabled}
                          title="Remove mask"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeLinearMask(m.id);
                          }}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                      <CollapsibleContent className="min-h-0 overflow-hidden">
                        <MaskAdjustmentDrawer
                          mask={m}
                          disabled={disabled}
                          onUpdateMask={(patch) => updateLinearMask(m.id, patch)}
                          onSetAdjustment={(scope, key, value) =>
                            setLinearMaskAdjustment(m.id, scope, key, value)
                          }
                        />
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                </li>
              );
            })}
          </ul>
        )}

        <Button
          type="button"
          variant="outline"
          className="h-9 min-h-9 w-full justify-start gap-2"
          disabled={disabled || masks.length >= MAX_LINEAR_MASKS}
          onClick={() => addLinearMask()}
        >
          <Plus className="size-4 shrink-0" />
          Add linear
        </Button>
      </div>
    </SidebarSection>
  );
}
