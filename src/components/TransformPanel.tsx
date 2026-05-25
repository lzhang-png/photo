import { Lock, LockOpen, RotateCcw, RotateCw } from "lucide-react";
import { useEffect, useState } from "react";
import {
  cropPixelAspect,
  cropToAspect,
  DEFAULT_GEOMETRY,
  isDefaultGeometry,
  normalizeGeometry,
  rotate90CCW,
  rotate90CW,
  type Geometry,
} from "../editor/geometry";
import {
  commitTransformSession,
  getLiveGeometry,
  isTransformSessionActive,
  reloadTransformSession,
  setSessionStraighten,
} from "../editor/transformSession";
import { useEditor, selectImage } from "../state/store";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { SidebarSection } from "./SidebarSection";

const ASPECT_PRESETS = [
  { label: "Original", aspect: -1 },
  { label: "1:1", aspect: 1 },
  { label: "4:3", aspect: 4 / 3 },
  { label: "3:2", aspect: 3 / 2 },
  { label: "16:9", aspect: 16 / 9 },
];

export function TransformPanel() {
  const image = useEditor(selectImage);
  const geom = useEditor((s) => s.photos[s.activePhotoId ?? ""]?.adjustments.geometry);
  const cropEditing = useEditor((s) => s.cropEditing);
  const setGeometry = useEditor((s) => s.setGeometry);
  const setCropEditing = useEditor((s) => s.setCropEditing);

  const disabled = !image;
  const baseGeom = geom ?? DEFAULT_GEOMETRY;
  const liveGeom = getLiveGeometry(baseGeom);

  const [straighten, setStraighten] = useState(baseGeom.straighten);

  useEffect(() => {
    if (!cropEditing) setStraighten(baseGeom.straighten);
  }, [cropEditing, baseGeom.straighten]);

  const applyGeometry = (patch: Partial<Geometry>) => {
    const next = normalizeGeometry({ ...getLiveGeometry(baseGeom), ...patch });
    setGeometry(patch);
    if (isTransformSessionActive()) reloadTransformSession(next);
  };

  const onStraightenChange = (n: number) => {
    setStraighten(n);
    if (cropEditing) {
      setSessionStraighten(n);
      return;
    }
    setGeometry({ straighten: n });
  };

  const onCropToggle = () => {
    if (!image) return;
    if (cropEditing) {
      setGeometry(commitTransformSession());
      setCropEditing(false);
      return;
    }
    setCropEditing(true);
  };

  return (
    <SidebarSection
      title="Transform"
      hint="Crop: drag to reposition, drag handles to resize · Level straightens horizons and auto-crops black corners"
    >
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          className="h-9 flex-1"
          title="Rotate 90° left"
          disabled={disabled}
          onClick={() => applyGeometry(rotate90CCW(liveGeom))}
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
          onClick={() => applyGeometry(rotate90CW(liveGeom))}
        >
          90°
          <RotateCw className="size-4" />
        </Button>
        <Button
          type="button"
          variant={cropEditing ? "default" : "outline"}
          className="h-9 flex-1"
          disabled={disabled}
          onClick={onCropToggle}
        >
          {cropEditing ? "Done" : "Crop"}
        </Button>
      </div>

      <div className="mt-4 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label className="font-normal">Level</Label>
          <div className="flex items-center gap-1.5">
            <span className="tabular-nums text-muted-foreground">
              {straighten >= 0 ? "+" : ""}
              {straighten.toFixed(1)}°
            </span>
            {straighten !== 0 && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground"
                title="Reset"
                disabled={disabled}
                onClick={() => onStraightenChange(0)}
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
          value={[straighten]}
          disabled={disabled}
          onValueChange={(v) => {
            const n = Array.isArray(v) ? v[0] : v;
            if (n !== undefined) onStraightenChange(n);
          }}
        />
      </div>

      <p className="mt-4 mb-2 text-[11px] text-muted-foreground">Aspect ratio</p>
      <div className="grid grid-cols-3 gap-2">
        <Button
          type="button"
          variant={liveGeom.aspectLocked ? "default" : "outline"}
          className="h-9"
          disabled={disabled}
          title={liveGeom.aspectLocked ? "Unlock aspect ratio" : "Lock aspect ratio"}
          onClick={() => {
            if (!image) return;
            if (liveGeom.aspectLocked) {
              applyGeometry({ aspectLocked: false });
              return;
            }
            applyGeometry({
              aspectLocked: true,
              lockedAspect: cropPixelAspect(liveGeom, image.width, image.height),
            });
          }}
        >
          {liveGeom.aspectLocked ? (
            <Lock className="size-4" />
          ) : (
            <LockOpen className="size-4" />
          )}
        </Button>
        {ASPECT_PRESETS.map((p) => (
          <Button
            key={p.label}
            type="button"
            variant="outline"
            className="h-9"
            disabled={disabled}
            onClick={() => {
              if (!image) return;
              if (p.aspect === -1) {
                applyGeometry({
                  cropX: 0,
                  cropY: 0,
                  cropW: 1,
                  cropH: 1,
                  aspectLocked: false,
                });
                return;
              }
              applyGeometry(cropToAspect(image.width, image.height, p.aspect, liveGeom));
            }}
          >
            {p.label}
          </Button>
        ))}
      </div>

      {!isDefaultGeometry(liveGeom) && (
        <Button
          type="button"
          variant="outline"
          className="mt-3 h-9 w-full"
          disabled={disabled}
          onClick={() => applyGeometry(DEFAULT_GEOMETRY)}
        >
          Reset transform
        </Button>
      )}
    </SidebarSection>
  );
}
