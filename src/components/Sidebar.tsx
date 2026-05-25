import { ClipboardCopy, ClipboardPaste, RotateCcw } from "lucide-react";
import { AdjustmentSlider } from "@/components/AdjustmentSlider";
import { InfoTooltip } from "@/components/InfoTooltip";
import { SidebarSection } from "@/components/SidebarSection";
import { TransformPanel } from "@/components/TransformPanel";
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
  DETAIL_SLIDERS,
  EFFECTS_SLIDERS,
  TONE_SLIDERS,
} from "../editor/adjustments";
import {
  DEFAULT_RAW_SETTINGS,
  DENOISE_OPTIONS,
  denoiseToSelectValue,
  rawSettingsEqual,
  selectValueToDenoise,
} from "../editor/rawSettings";
import { FILM_STOCKS } from "../editor/filmStocks";
import { useFilmPreviewUrls } from "../hooks/useFilmPreviews";
import {
  selectAdjustments,
  selectImage,
  selectIsRaw,
  selectRawSettings,
  useEditor,
} from "../state/store";
import { CurveEditor } from "./CurveEditor";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const adj = useEditor(selectAdjustments);
  const isRaw = useEditor(selectIsRaw);
  const raw = useEditor(selectRawSettings);
  const setAdjustment = useEditor((s) => s.setAdjustment);
  const setRawSetting = useEditor((s) => s.setRawSetting);
  const resetRawSettings = useEditor((s) => s.resetRawSettings);
  const copyEditSettings = useEditor((s) => s.copyEditSettings);
  const pasteEditSettings = useEditor((s) => s.pasteEditSettings);
  const editSettingsClipboard = useEditor((s) => s.editSettingsClipboard);
  const disabled = !useEditor(selectImage);
  const filmPreviews = useFilmPreviewUrls();

  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden border-l border-border bg-sidebar">
      <ScrollArea className="min-h-0 flex-1">
        <div className="pb-4">
          <SidebarSection
            title="Edit Settings"
            hint="Copy tone, color, detail, effects, film, and curve from this photo. Crop, rotation, and straighten are not included."
          >
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-9"
                disabled={disabled}
                onClick={copyEditSettings}
              >
                <ClipboardCopy className="size-3.5" />
                Copy
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-9"
                disabled={disabled || !editSettingsClipboard}
                onClick={pasteEditSettings}
              >
                <ClipboardPaste className="size-3.5" />
                Paste
              </Button>
            </div>
          </SidebarSection>

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

          <TransformPanel />

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
            title="Detail"
            hint="Definition and sharpening enhance texture. Noise sliders smooth grain after develop — separate from RAW Develop denoise."
          >
            <div className="space-y-5">
              {DETAIL_SLIDERS.map((s) => (
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
                    "h-auto w-full flex-col items-stretch gap-1.5 px-2 py-2 text-center leading-tight whitespace-normal",
                    adj.film === stock.id &&
                      "border-primary bg-primary/15 text-foreground",
                  )}
                  pressed={adj.film === stock.id}
                  title={stock.hint}
                  onPressedChange={() => setAdjustment("film", stock.id)}
                >
                  {filmPreviews[stock.id] ? (
                    <img
                      src={filmPreviews[stock.id]}
                      alt=""
                      className="aspect-video w-full rounded-sm object-cover ring-1 ring-border/60"
                      draggable={false}
                    />
                  ) : (
                    <span className="aspect-video w-full rounded-sm bg-muted ring-1 ring-border/60" />
                  )}
                  <span className="min-w-0 text-xs leading-tight">{stock.label}</span>
                </Toggle>
              ))}
            </div>
          </SidebarSection>

          <SidebarSection
            title="Effects"
            hint="Creative overlays — grain amount, size (coarse vs fine particles), and density (light even spread vs rich heavy grain); vintage fades tones, warms color, and adds a soft vignette."
          >
            <div className="space-y-5">
              {EFFECTS_SLIDERS.map((s) => (
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
            title="Tone Curve"
            hint="Drag points · click to add · double-click point to remove · double-click background to reset"
          >
            <CurveEditor
              points={adj.curve}
              onChange={(c) => setAdjustment("curve", c)}
            />
          </SidebarSection>
        </div>
      </ScrollArea>
    </aside>
  );
}
