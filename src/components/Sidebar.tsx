import { RotateCcw, RotateCw } from "lucide-react";
import { AdjustmentSlider } from "@/components/AdjustmentSlider";
import { InfoTooltip } from "@/components/InfoTooltip";
import { SidebarSection } from "@/components/SidebarSection";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Toggle } from "@/components/ui/toggle";
import {
  COLOR_SLIDERS,
  TONE_SLIDERS,
} from "../editor/adjustments";
import {
  cropToAspect,
  DEFAULT_GEOMETRY,
  isDefaultGeometry,
  rotate90CCW,
  rotate90CW,
} from "../editor/geometry";
import {
  DEFAULT_RAW_SETTINGS,
  DENOISE_OPTIONS,
  denoiseToSelectValue,
  rawSettingsEqual,
  selectValueToDenoise,
} from "../editor/rawSettings";
import { FILM_STOCKS } from "../editor/filmStocks";
import {
  selectAdjustments,
  selectImage,
  selectIsRaw,
  selectRawSettings,
  useEditor,
} from "../state/store";
import { CurveEditor } from "./CurveEditor";
import { cn } from "@/lib/utils";

const ASPECT_PRESETS: { label: string; aspect: number | null }[] = [
  { label: "Free", aspect: null },
  { label: "Original", aspect: -1 },
  { label: "1:1", aspect: 1 },
  { label: "4:3", aspect: 4 / 3 },
  { label: "3:2", aspect: 3 / 2 },
  { label: "16:9", aspect: 16 / 9 },
];

export function Sidebar() {
  const adj = useEditor(selectAdjustments);
  const image = useEditor(selectImage);
  const isRaw = useEditor(selectIsRaw);
  const raw = useEditor(selectRawSettings);
  const photoCount = useEditor((s) => s.photoOrder.length);
  const cropEditing = useEditor((s) => s.cropEditing);
  const setAdjustment = useEditor((s) => s.setAdjustment);
  const setGeometry = useEditor((s) => s.setGeometry);
  const setCropEditing = useEditor((s) => s.setCropEditing);
  const setRawSetting = useEditor((s) => s.setRawSetting);
  const resetRawSettings = useEditor((s) => s.resetRawSettings);
  const applyAdjustmentsToAll = useEditor((s) => s.applyAdjustmentsToAll);
  const applyRawSettingsToAll = useEditor((s) => s.applyRawSettingsToAll);
  const geom = adj.geometry;
  const disabled = !image;

  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden border-l border-border bg-sidebar">
      <ScrollArea className="min-h-0 flex-1">
        <div className="pb-4">
          {photoCount > 1 && (
            <SidebarSection
              title="Bulk Edit"
              hint="Copies the current photo's settings to every photo in the catalog. Edits are saved automatically."
            >
              <div className="space-y-2.5">
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 w-full"
                  onClick={applyAdjustmentsToAll}
                >
                  Apply adjustments to all
                </Button>
                {isRaw && (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 w-full"
                    onClick={applyRawSettingsToAll}
                  >
                    Apply RAW settings to all RAW
                  </Button>
                )}
              </div>
            </SidebarSection>
          )}

          {isRaw && (
            <SidebarSection
              title="RAW Develop"
              hint="Changes reprocess the file (may take a few seconds)."
            >
              <div className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="raw-denoise">Denoise</Label>
                  <Select
                    value={denoiseToSelectValue(raw.denoise)}
                    onValueChange={(v) => {
                      if (v) setRawSetting("denoise", selectValueToDenoise(v));
                    }}
                  >
                    <SelectTrigger id="raw-denoise" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DENOISE_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex min-h-9 items-center gap-3">
                  <Checkbox
                    id="raw-autobright"
                    checked={raw.autoBright}
                    onCheckedChange={(checked) =>
                      setRawSetting("autoBright", checked === true)
                    }
                  />
                  <Label htmlFor="raw-autobright" className="font-normal">
                    Auto brightness
                  </Label>
                  <InfoTooltip text="Off = darker, flatter linear decode. All RAW files get a soft, slightly muted develop pass after decode." />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="font-normal">Demosaic</Label>
                    <div className="flex items-center gap-1.5">
                      <span className="tabular-nums text-muted-foreground">
                        {raw.demosaicQuality}
                      </span>
                      {raw.demosaicQuality !==
                        DEFAULT_RAW_SETTINGS.demosaicQuality && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="text-muted-foreground"
                          title="Reset"
                          onClick={() =>
                            setRawSetting(
                              "demosaicQuality",
                              DEFAULT_RAW_SETTINGS.demosaicQuality,
                            )
                          }
                        >
                          <RotateCcw className="size-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <Slider
                    min={0}
                    max={12}
                    step={1}
                    value={[raw.demosaicQuality]}
                    onValueChange={(v) => {
                      const n = Array.isArray(v) ? v[0] : v;
                      if (n !== undefined) setRawSetting("demosaicQuality", n);
                    }}
                  />
                </div>

                {!rawSettingsEqual(raw, DEFAULT_RAW_SETTINGS) && (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 w-full"
                    onClick={resetRawSettings}
                  >
                    Reset RAW settings
                  </Button>
                )}
              </div>
            </SidebarSection>
          )}

          <SidebarSection
            title="Transform"
            hint="Crop: drag handles in crop mode · Level straightens horizons"
          >
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-9 flex-1"
                title="Rotate 90° left"
                disabled={disabled}
                onClick={() => setGeometry(rotate90CCW(geom))}
              >
                <RotateCcw className="size-4" />
                90°
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-9 flex-1"
                title="Rotate 90° right"
                disabled={disabled}
                onClick={() => setGeometry(rotate90CW(geom))}
              >
                90°
                <RotateCw className="size-4" />
              </Button>
              <Button
                type="button"
                variant={cropEditing ? "default" : "outline"}
                className="h-9 flex-1"
                disabled={disabled}
                onClick={() => setCropEditing(!cropEditing)}
              >
                {cropEditing ? "Done" : "Crop"}
              </Button>
            </div>

            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label className="font-normal">Level</Label>
                <div className="flex items-center gap-1.5">
                  <span className="tabular-nums text-muted-foreground">
                    {geom.straighten >= 0 ? "+" : ""}
                    {geom.straighten.toFixed(1)}°
                  </span>
                  {geom.straighten !== 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="text-muted-foreground"
                      title="Reset"
                      disabled={disabled}
                      onClick={() => setGeometry({ straighten: 0 })}
                    >
                      <RotateCcw className="size-4" />
                    </Button>
                  )}
                </div>
              </div>
              <Slider
                min={-15}
                max={15}
                step={0.1}
                value={[geom.straighten]}
                disabled={disabled}
                onValueChange={(v) => {
                  const n = Array.isArray(v) ? v[0] : v;
                  if (n !== undefined) setGeometry({ straighten: n });
                }}
              />
            </div>

            <p className="mt-4 mb-2 text-[11px] text-muted-foreground">
              Aspect ratio
            </p>
            <div className="grid grid-cols-3 gap-2">
              {ASPECT_PRESETS.map((p) => (
                <Button
                  key={p.label}
                  type="button"
                  variant="outline"
                  className="h-9"
                  disabled={disabled || p.aspect === null}
                  onClick={() => {
                    if (!image) return;
                    if (p.aspect === null) return;
                    if (p.aspect === -1) {
                      setGeometry({
                        cropX: 0,
                        cropY: 0,
                        cropW: 1,
                        cropH: 1,
                      });
                      return;
                    }
                    setGeometry(
                      cropToAspect(image.width, image.height, p.aspect, geom),
                    );
                  }}
                >
                  {p.label}
                </Button>
              ))}
            </div>

            {!isDefaultGeometry(geom) && (
              <Button
                type="button"
                variant="outline"
                className="mt-3 h-9 w-full"
                disabled={disabled}
                onClick={() => setGeometry(DEFAULT_GEOMETRY)}
              >
                Reset transform
              </Button>
            )}
          </SidebarSection>

          <SidebarSection title="Light">
            <div className="space-y-5">
              {TONE_SLIDERS.map((s) => (
                <AdjustmentSlider
                  key={s.key}
                  spec={s}
                  value={adj[s.key]}
                  disabled={disabled}
                  onChange={(v) => setAdjustment(s.key, v)}
                />
              ))}
            </div>
          </SidebarSection>

          <SidebarSection title="Color">
            <div className="space-y-5">
              {COLOR_SLIDERS.map((s) => (
                <AdjustmentSlider
                  key={s.key}
                  spec={s}
                  value={adj[s.key]}
                  disabled={disabled}
                  onChange={(v) => setAdjustment(s.key, v)}
                />
              ))}
            </div>
          </SidebarSection>

          <SidebarSection
            title="Film"
            hint={
              adj.film !== "none"
                ? FILM_STOCKS.find((s) => s.id === adj.film)?.hint
                : undefined
            }
          >
            <div className="grid grid-cols-2 gap-2">
              {FILM_STOCKS.map((stock) => (
                <Toggle
                  key={stock.id}
                  variant="outline"
                  className={cn(
                    "h-auto min-h-9 px-2.5 py-2 leading-tight",
                    adj.film === stock.id &&
                      "border-primary bg-primary/15 text-foreground",
                  )}
                  pressed={adj.film === stock.id}
                  title={stock.hint}
                  onPressedChange={() => setAdjustment("film", stock.id)}
                >
                  {stock.label}
                </Toggle>
              ))}
            </div>
          </SidebarSection>

          <section className="px-4 py-4">
            <div className="mb-3 flex items-center gap-1.5">
              <h3 className="text-base font-medium uppercase tracking-wider text-muted-foreground">
                Tone Curve
              </h3>
              <InfoTooltip text="Drag points · click to add · double-click point to remove · double-click background to reset" />
            </div>
            <CurveEditor
              points={adj.curve}
              onChange={(c) => setAdjustment("curve", c)}
            />
          </section>
        </div>
      </ScrollArea>
    </aside>
  );
}
