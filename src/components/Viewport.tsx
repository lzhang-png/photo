import { BarChart3, Eye, Minus, Plus, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { originalPreviewAdjustments } from "../editor/adjustments";
import {
  beginTransformSession,
  computePreviewFrame,
  endTransformSession,
  getSessionRenderGeometry,
  isTransformSessionActive,
  registerTransformRender,
  scheduleTransformRender,
  syncSessionAfterFrame,
} from "../editor/transformSession";
import { getOutputSize } from "../editor/geometry";
import {
  layoutSocialTemplatePreview,
  socialTemplateBackgroundCss,
  type SocialTemplateLayout,
} from "../editor/socialTemplate";
import { type ImageFrame } from "../editor/viewLayout";
import { Button } from "@/components/ui/button";
import { decode } from "../editor/decode";
import { supportsDirectoryPicker } from "../editor/fileAccess";
import { createBatchProgressReporter } from "../editor/decodeProgress";
import { Pipeline } from "../editor/pipeline";
import {
  selectAdjustments,
  selectImage,
  selectIsRaw,
  selectRawSettings,
  selectSocialTemplate,
  selectSourceFile,
  useEditor,
} from "../state/store";
import { cn } from "@/lib/utils";
import { Histogram } from "./Histogram";
import { CropOverlay } from "./CropOverlay";

const RAW_REDECODE_MS = 400;
const ZOOM_MIN = 1;
const ZOOM_MAX = 4;
const ZOOM_STEP = 1.25;
const WHEEL_ZOOM_SENSITIVITY = 0.002;
const COMPARE_CLICK_MS = 2000;
const COMPARE_HOLD_THRESHOLD_MS = 250;

function clampZoom(z: number) {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
}

type Pan = { x: number; y: number };

function clampPan(
  pan: Pan,
  zoom: number,
  viewportW: number,
  viewportH: number,
): Pan {
  if (zoom <= 1) return { x: 0, y: 0 };
  const maxX = (viewportW * (zoom - 1)) / 2;
  const maxY = (viewportH * (zoom - 1)) / 2;
  return {
    x: Math.max(-maxX, Math.min(maxX, pan.x)),
    y: Math.max(-maxY, Math.min(maxY, pan.y)),
  };
}

function zoomAtPoint(
  zoom: number,
  pan: Pan,
  nextZoom: number,
  focalX: number,
  focalY: number,
  viewportW: number,
  viewportH: number,
): { zoom: number; pan: Pan } {
  if (nextZoom <= ZOOM_MIN + 1e-6) {
    return { zoom: ZOOM_MIN, pan: { x: 0, y: 0 } };
  }
  const scale = nextZoom / zoom;
  const cx = focalX - viewportW / 2;
  const cy = focalY - viewportH / 2;
  return {
    zoom: nextZoom,
    pan: clampPan(
      {
        x: pan.x * scale + cx * (1 - scale),
        y: pan.y * scale + cy * (1 - scale),
      },
      nextZoom,
      viewportW,
      viewportH,
    ),
  };
}

function framesEqual(a: ImageFrame | null, b: ImageFrame | null) {
  if (!a || !b) return a === b;
  return a.ox === b.ox && a.oy === b.oy && a.dw === b.dw && a.dh === b.dh;
}

export function Viewport() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const pipelineRef = useRef<Pipeline | null>(null);
  const skipRawRedecodeRef = useRef(true);
  const compareOriginalRef = useRef(false);
  const compareTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const compareDownAtRef = useRef(0);
  const comparePointerActiveRef = useRef(false);
  const panDragRef = useRef({
    active: false,
    startX: 0,
    startY: 0,
    startPanX: 0,
    startPanY: 0,
  });
  const imageFrameRef = useRef<ImageFrame | null>(null);
  const cropWasActiveRef = useRef(false);
  const zoomRef = useRef(1);
  const panRef = useRef<Pan>({ x: 0, y: 0 });
  const wheelZoomTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [dragging, setDragging] = useState(false);
  const [compareOriginal, setCompareOriginal] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Pan>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [wheelZooming, setWheelZooming] = useState(false);
  const [imageFrame, setImageFrame] = useState<ImageFrame | null>(null);
  const [socialLayout, setSocialLayout] = useState<SocialTemplateLayout | null>(
    null,
  );
  const [histogramTick, setHistogramTick] = useState(0);

  const cropPreview = useEditor((s) => s.cropEditing);
  const socialTemplate = useEditor(selectSocialTemplate);
  const showHistogram = useEditor((s) => s.showHistogram);
  const toggleHistogram = useEditor((s) => s.toggleHistogram);
  const geometry = useEditor((s) =>
    s.activePhotoId ? s.photos[s.activePhotoId]?.adjustments.geometry : undefined,
  );

  const image = useEditor(selectImage);
  const adjustments = useEditor(selectAdjustments);
  const sourceFile = useEditor(selectSourceFile);
  const isRaw = useEditor(selectIsRaw);
  const rawSettings = useEditor(selectRawSettings);
  const activePhotoId = useEditor((s) => s.activePhotoId);
  const importPhotoFiles = useEditor((s) => s.importPhotoFiles);
  const reopenPhotosFromDirectory = useEditor((s) => s.reopenPhotosFromDirectory);
  const sourceDirectoryName = useEditor((s) => s.sourceDirectoryName);
  const setDecodedImage = useEditor((s) => s.setDecodedImage);
  const setStatus = useEditor((s) => s.setStatus);
  const setDecodeProgress = useEditor((s) => s.setDecodeProgress);
  const photoOrder = useEditor((s) => s.photoOrder);
  const restoringFiles = useEditor((s) => s.restoringFiles);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    panRef.current = pan;
  }, [pan]);

  useEffect(() => {
    return () => {
      if (wheelZoomTimerRef.current) clearTimeout(wheelZoomTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el || !image || cropPreview || socialTemplate.enabled) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const focalX = e.clientX - rect.left;
      const focalY = e.clientY - rect.top;
      const factor = Math.exp(-e.deltaY * WHEEL_ZOOM_SENSITIVITY);
      const next = zoomAtPoint(
        zoomRef.current,
        panRef.current,
        clampZoom(zoomRef.current * factor),
        focalX,
        focalY,
        rect.width,
        rect.height,
      );
      zoomRef.current = next.zoom;
      panRef.current = next.pan;
      setZoom(next.zoom);
      setPan(next.pan);
      setWheelZooming(true);
      if (wheelZoomTimerRef.current) clearTimeout(wheelZoomTimerRef.current);
      wheelZoomTimerRef.current = setTimeout(() => {
        wheelZoomTimerRef.current = null;
        setWheelZooming(false);
      }, 150);
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [image, cropPreview, socialTemplate.enabled]);

  const setImageFrameIfChanged = useCallback((frame: ImageFrame | null) => {
    if (framesEqual(imageFrameRef.current, frame)) return;
    imageFrameRef.current = frame;
    setImageFrame(frame);
  }, []);

  const paintFrame = useCallback(
    (preview?: boolean) => {
      const pipe = pipelineRef.current;
      const el = viewportRef.current;
      if (!pipe || !image || !el) return;

      const previewMode = preview ?? useEditor.getState().cropEditing;

      const baseAdj = selectAdjustments(useEditor.getState());
      const renderAdj = compareOriginalRef.current
        ? originalPreviewAdjustments(baseAdj)
        : baseAdj;
      const liveGeometry = getSessionRenderGeometry(renderAdj.geometry);
      const renderGeometry = { ...renderAdj, geometry: liveGeometry };
      const photoSize = getOutputSize(
        image.width,
        image.height,
        liveGeometry,
      );

      if (socialTemplate.enabled && !previewMode) {
        const layout = layoutSocialTemplatePreview(
          el.clientWidth,
          el.clientHeight,
          photoSize.width,
          photoSize.height,
        );
        setSocialLayout(layout);
        setImageFrameIfChanged(null);
      } else {
        setSocialLayout(null);
        const frame = computePreviewFrame(
          el.clientWidth,
          el.clientHeight,
          image.width,
          image.height,
          liveGeometry,
        );
        setImageFrameIfChanged(frame);
        if (previewMode && isTransformSessionActive()) {
          syncSessionAfterFrame(frame, liveGeometry);
        }
      }

      pipe.fitToContainer(renderGeometry, false);
      pipe.render(renderGeometry, false);
    },
    [image, setImageFrameIfChanged, socialTemplate.enabled],
  );

  useEffect(() => {
    registerTransformRender(() => paintFrame());
    return () => registerTransformRender(null);
  }, [paintFrame]);

  const startCompare = useCallback(() => {
    if (compareOriginalRef.current) return;
    compareOriginalRef.current = true;
    setCompareOriginal(true);
    paintFrame(false);
  }, [paintFrame]);

  const endCompare = useCallback(() => {
    if (compareTimeoutRef.current) {
      clearTimeout(compareTimeoutRef.current);
      compareTimeoutRef.current = null;
    }
    if (!compareOriginalRef.current) return;
    compareOriginalRef.current = false;
    setCompareOriginal(false);
    paintFrame(false);
  }, [paintFrame]);

  const finishComparePointer = useCallback(
    (downAt: number) => {
      const heldMs = Date.now() - downAt;
      if (heldMs >= COMPARE_HOLD_THRESHOLD_MS) {
        endCompare();
      } else {
        compareTimeoutRef.current = setTimeout(() => {
          compareTimeoutRef.current = null;
          endCompare();
        }, COMPARE_CLICK_MS);
      }
    },
    [endCompare],
  );

  const applyPan = useCallback(
    (next: Pan) => {
      const el = viewportRef.current;
      if (!el) {
        setPan(next);
        return;
      }
      setPan(clampPan(next, zoom, el.clientWidth, el.clientHeight));
    },
    [zoom],
  );

  const isZoomedIn = zoom > ZOOM_MIN + 1e-6;

  const resetView = useCallback(() => {
    panDragRef.current.active = false;
    setIsPanning(false);
    zoomRef.current = 1;
    panRef.current = { x: 0, y: 0 };
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const measureImageFrame = useCallback(() => {
    scheduleTransformRender();
  }, []);

  useEffect(() => {
    if (!canvasRef.current) return;
    try {
      pipelineRef.current = new Pipeline(canvasRef.current);
    } catch (err) {
      setStatus(`WebGL init failed: ${(err as Error).message}`);
    }
  }, [setStatus]);

  useEffect(() => {
    const pipe = pipelineRef.current;
    if (!pipe) return;
    if (image) pipe.setImage(image);
    else pipe.clearImage();
    paintFrame();
    setHistogramTick((t) => t + 1);
  }, [image, paintFrame]);

  useEffect(() => {
    paintFrame();
    if (!cropPreview) setHistogramTick((t) => t + 1);
  }, [adjustments, cropPreview, socialTemplate, paintFrame]);

  useEffect(() => {
    if (socialTemplate.enabled) resetView();
  }, [socialTemplate.enabled, resetView]);

  useEffect(() => {
    measureImageFrame();
    const el = viewportRef.current;
    if (!el) return;
    const ro = new ResizeObserver(measureImageFrame);
    ro.observe(el);
    window.addEventListener("resize", measureImageFrame);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measureImageFrame);
    };
  }, [measureImageFrame]);

  useEffect(() => {
    if (!cropPreview) {
      if (cropWasActiveRef.current) endTransformSession();
      cropWasActiveRef.current = false;
      endCompare();
      resetView();
      return;
    }

    endCompare();
    resetView();
    const el = viewportRef.current;
    const g = selectAdjustments(useEditor.getState()).geometry;
    if (!el || !image) return;

    const frame = computePreviewFrame(
      el.clientWidth,
      el.clientHeight,
      image.width,
      image.height,
      g,
    );
    setImageFrameIfChanged(frame);

    if (!cropWasActiveRef.current) {
      cropWasActiveRef.current = true;
      beginTransformSession(g, image.width, image.height, frame);
    }
  }, [cropPreview, endCompare, resetView, image, setImageFrameIfChanged]);

  useEffect(() => () => endCompare(), [endCompare]);

  useEffect(() => {
    skipRawRedecodeRef.current = true;
  }, [activePhotoId, sourceFile]);

  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [activePhotoId, image?.width, image?.height]);

  useEffect(() => {
    if (zoom <= 1) {
      setPan({ x: 0, y: 0 });
      return;
    }
    setPan((p) => {
      const el = viewportRef.current;
      if (!el) return p;
      return clampPan(p, zoom, el.clientWidth, el.clientHeight);
    });
  }, [zoom]);

  useEffect(() => {
    if (!sourceFile || !isRaw) return;
    if (skipRawRedecodeRef.current) {
      skipRawRedecodeRef.current = false;
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setStatus("Reprocessing RAW…");
      try {
        const decoded = await decode(
          sourceFile,
          rawSettings,
          createBatchProgressReporter(
            setDecodeProgress,
            0,
            1,
            "Reprocessing RAW",
          ),
        );
        if (cancelled) return;
        setDecodedImage(decoded);
        setStatus(`${decoded.width} × ${decoded.height}`);
      } catch (err) {
        if (!cancelled) {
          setStatus(`RAW failed: ${(err as Error).message}`);
        }
      } finally {
        if (!cancelled) setDecodeProgress(null);
      }
    }, RAW_REDECODE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      setDecodeProgress(null);
    };
  }, [rawSettings, sourceFile, isRaw, setDecodedImage, setStatus, setDecodeProgress]);

  useEffect(() => {
    if (!activePhotoId) return;
    const photo = useEditor.getState().photos[activePhotoId];
    if (!photo?.sourceFile || photo.image) return;

    let cancelled = false;
    (async () => {
      setStatus(`Decoding ${photo.filename}…`);
      try {
        const decoded = await decode(
          photo.sourceFile!,
          photo.rawSettings,
          createBatchProgressReporter(
            setDecodeProgress,
            0,
            1,
            `Decoding ${photo.filename}`,
          ),
        );
        if (cancelled) return;
        setDecodedImage(decoded);
        setStatus(`${decoded.width} × ${decoded.height}`);
      } catch (err) {
        if (!cancelled) {
          setStatus(`Failed: ${(err as Error).message}`);
        }
      } finally {
        if (!cancelled) setDecodeProgress(null);
      }
    })();

    return () => {
      cancelled = true;
      setDecodeProgress(null);
    };
  }, [activePhotoId, sourceFile, setDecodedImage, setStatus, setDecodeProgress]);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    await importPhotoFiles(Array.from(files));
  };

  const onComparePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!image || cropPreview) return;
    e.preventDefault();
    if (compareTimeoutRef.current) {
      clearTimeout(compareTimeoutRef.current);
      compareTimeoutRef.current = null;
    }
    compareDownAtRef.current = Date.now();
    comparePointerActiveRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    startCompare();
  };

  const onComparePointerEnd = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!comparePointerActiveRef.current) return;
    comparePointerActiveRef.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    finishComparePointer(compareDownAtRef.current);
  };

  const onCompareLostPointerCapture = () => {
    if (!comparePointerActiveRef.current) return;
    comparePointerActiveRef.current = false;
    finishComparePointer(compareDownAtRef.current);
  };

  const onCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!image || cropPreview || e.button !== 0 || zoom <= 1) return;
    panDragRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      startPanX: pan.x,
      startPanY: pan.y,
    };
    setIsPanning(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = panDragRef.current;
    if (!p.active) return;
    applyPan({
      x: p.startPanX + (e.clientX - p.startX),
      y: p.startPanY + (e.clientY - p.startY),
    });
  };

  const endPan = (e: React.PointerEvent<HTMLCanvasElement>) => {
    panDragRef.current.active = false;
    setIsPanning(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const liveGeometry = geometry
    ? getSessionRenderGeometry(geometry)
    : undefined;

  const showSocialTemplate =
    !!image && socialTemplate.enabled && !cropPreview && !!socialLayout;
  const canvasFrame = cropPreview && imageFrame
    ? imageFrame
    : showSocialTemplate && socialLayout
      ? socialLayout.photo
      : null;

  return (
    <div
      ref={viewportRef}
      className={cn(
        "group/viewport relative h-full min-h-0 overflow-hidden bg-[repeating-conic-gradient(#1d1d1d_0%_25%,#161616_0%_50%)] bg-size-[24px_24px]",
        dragging &&
          "after:pointer-events-none after:absolute after:inset-2 after:rounded-md after:border-2 after:border-dashed after:border-primary",
        cropPreview && "[&_canvas]:pointer-events-none",
        showSocialTemplate && "bg-[#1a1a1a] bg-none",
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        handleFiles(e.dataTransfer.files);
      }}
    >
      {showSocialTemplate && socialLayout && (
        <div
          className="pointer-events-none absolute overflow-hidden rounded-[2rem] shadow-2xl ring-1 ring-white/10"
          style={{
            left: socialLayout.template.ox,
            top: socialLayout.template.oy,
            width: socialLayout.template.dw,
            height: socialLayout.template.dh,
            backgroundColor: socialTemplateBackgroundCss(
              socialTemplate.background,
            ),
          }}
        />
      )}
      <canvas
        ref={canvasRef}
        className={cn(
          "absolute origin-center",
          canvasFrame
            ? null
            : "inset-0 size-full object-contain object-center",
          !cropPreview &&
            !showSocialTemplate &&
            !isPanning &&
            !wheelZooming &&
            "transition-transform duration-150 ease-out",
          image &&
            !cropPreview &&
            !showSocialTemplate &&
            zoom > 1 &&
            (isPanning ? "cursor-grabbing" : "cursor-grab"),
        )}
        style={
          canvasFrame
            ? {
                left: canvasFrame.ox,
                top: canvasFrame.oy,
                width: canvasFrame.dw,
                height: canvasFrame.dh,
              }
            : {
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              }
        }
        onPointerDown={onCanvasPointerDown}
        onPointerMove={onCanvasPointerMove}
        onPointerUp={endPan}
        onPointerCancel={endPan}
        onLostPointerCapture={() => {
          panDragRef.current.active = false;
          setIsPanning(false);
        }}
      />
      {image && (
        <div
          className={cn(
            "absolute right-3 bottom-3 z-20 flex items-center gap-0.5 rounded-lg border border-border bg-sidebar/95 p-0.5 shadow-md backdrop-blur-sm",
            "pointer-events-none opacity-0 transition-opacity duration-200",
            "group-hover/viewport:pointer-events-auto group-hover/viewport:opacity-100",
          )}
        >
          <Button
            type="button"
            variant={showHistogram ? "secondary" : "ghost"}
            size="icon-sm"
            className="text-muted-foreground"
            title={showHistogram ? "Hide histogram" : "Show histogram"}
            onClick={toggleHistogram}
          >
            <BarChart3 className="size-4" />
          </Button>
          <div className="mx-0.5 w-px self-stretch bg-border" />
          <Button
            type="button"
            variant={compareOriginal ? "secondary" : "ghost"}
            size="sm"
            className="h-8 gap-1.5 px-2.5 text-xs select-none"
            title="Click for 2s preview, hold to compare"
            disabled={cropPreview}
            onPointerDown={onComparePointerDown}
            onPointerUp={onComparePointerEnd}
            onPointerCancel={onComparePointerEnd}
            onLostPointerCapture={onCompareLostPointerCapture}
          >
            <Eye className="size-3.5" />
            Original
          </Button>
          <div className="mx-0.5 w-px self-stretch bg-border" />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className={cn(
              "text-muted-foreground",
              !isZoomedIn && "pointer-events-none w-0 min-w-0 overflow-hidden p-0 opacity-0",
            )}
            title="Reset zoom and pan"
            disabled={!isZoomedIn || cropPreview}
            tabIndex={isZoomedIn ? 0 : -1}
            aria-hidden={!isZoomedIn}
            onClick={resetView}
          >
            <RotateCcw className="size-4" />
          </Button>
          <div
            className={cn(
              "mx-0.5 w-px self-stretch bg-border",
              !isZoomedIn && "opacity-0",
            )}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            title="Zoom out"
            disabled={zoom <= ZOOM_MIN + 1e-6}
            onClick={() => {
              setZoom((z) => {
                const next = clampZoom(z / ZOOM_STEP);
                if (next <= 1) setPan({ x: 0, y: 0 });
                return next;
              });
            }}
          >
            <Minus className="size-4" />
          </Button>
          <span className="min-w-11 px-1 text-center text-xs tabular-nums text-muted-foreground">
            {Math.round(zoom * 100)}%
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            title="Zoom in"
            disabled={zoom >= ZOOM_MAX - 1e-6}
            onClick={() => setZoom((z) => clampZoom(z * ZOOM_STEP))}
          >
            <Plus className="size-4" />
          </Button>
        </div>
      )}
      {showHistogram && image && (
        <Histogram
          source={canvasRef.current}
          deps={[histogramTick]}
          className="pointer-events-none absolute top-3 right-3 z-20"
        />
      )}
      {compareOriginal && (
        <div className="pointer-events-none absolute top-3 left-1/2 z-10 -translate-x-1/2 rounded-md bg-black/70 px-2.5 py-1 text-xs font-medium text-white">
          Original
        </div>
      )}
      {cropPreview && image && imageFrame && liveGeometry && (
        <div
          className="absolute z-10"
          style={{
            left: imageFrame.ox,
            top: imageFrame.oy,
            width: imageFrame.dw,
            height: imageFrame.dh,
          }}
        >
          <CropOverlay
            image={image}
            geometry={liveGeometry}
            viewW={imageFrame.dw}
            viewH={imageFrame.dh}
          />
        </div>
      )}
      {!image && photoOrder.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-base text-muted-foreground">
          <p className="m-0">Drop photos here to start</p>
          <p className="m-0 text-[11px] text-muted-foreground">
            JPEG, PNG, WebP, or RAW — select multiple files when opening
          </p>
        </div>
      )}
      {!image && photoOrder.length > 0 && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-base text-muted-foreground">
          {restoringFiles ? (
            <>
              <p className="m-0">Restoring photos…</p>
              <p className="m-0 text-[11px] text-muted-foreground">
                Loading saved files from this browser
              </p>
            </>
          ) : (
            <>
              <p className="m-0">Photos need to be re-opened</p>
              <p className="m-0 text-[11px] text-muted-foreground">
                {supportsDirectoryPicker()
                  ? sourceDirectoryName
                    ? `Click Re-open to load from ${sourceDirectoryName}`
                    : "Click Re-open once to link your photo folder"
                  : "Use Open… and select the same files"}
              </p>
              {supportsDirectoryPicker() && (
                <Button
                  type="button"
                  variant="outline"
                  className="pointer-events-auto border-primary/40 text-primary"
                  onClick={() => reopenPhotosFromDirectory()}
                >
                  Re-open
                  {sourceDirectoryName ? ` · ${sourceDirectoryName}` : ""}
                </Button>
              )}
            </>
          )}
        </div>
      )}
      <input
        id="file-input"
        type="file"
        multiple
        accept="image/*,.cr2,.cr3,.nef,.arw,.dng,.raf,.rw2,.orf,.pef,.srw"
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
