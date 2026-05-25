import { BarChart3, Eye, Minus, Plus, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { originalPreviewAdjustments } from "../editor/adjustments";
import {
  clampScreenRect,
  clampScreenRectPosition,
  getFullRotatedPreviewSize,
  rotationRadians,
  scaleScreenRect,
  screenRectToOutputRect,
  screenRectToSourceCrop,
  sourceCropToScreenRect,
  type Geometry,
  type ScreenRect,
} from "../editor/geometry";
import { fitImageInBox, type ImageFrame } from "../editor/viewLayout";
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
  selectSourceFile,
  useEditor,
} from "../state/store";
import { cn } from "@/lib/utils";
import { Histogram } from "./Histogram";
import { TransformOverlay } from "./TransformOverlay";

const RAW_REDECODE_MS = 400;
const ZOOM_MIN = 1;
const ZOOM_MAX = 4;
const ZOOM_STEP = 1.25;
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

export function Viewport() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const cropOverlayRef = useRef<HTMLDivElement>(null);
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
  const cropTrackRef = useRef<{
    geometry: Geometry;
    frameW: number;
    frameH: number;
  } | null>(null);
  const cropScreenRectRef = useRef<ScreenRect | null>(null);
  const skipCropResyncRef = useRef(false);
  const [cropScreenRect, setCropScreenRect] = useState<ScreenRect | null>(null);
  const [dragging, setDragging] = useState(false);
  const [compareOriginal, setCompareOriginal] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Pan>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [imageFrame, setImageFrame] = useState<ImageFrame | null>(null);
  const [histogramTick, setHistogramTick] = useState(0);
  const cropPreview = useEditor((s) => s.cropEditing);
  const showHistogram = useEditor((s) => s.showHistogram);
  const toggleHistogram = useEditor((s) => s.toggleHistogram);

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
  const setGeometry = useEditor((s) => s.setGeometry);
  const setStatus = useEditor((s) => s.setStatus);
  const setDecodeProgress = useEditor((s) => s.setDecodeProgress);
  const photoOrder = useEditor((s) => s.photoOrder);
  const restoringFiles = useEditor((s) => s.restoringFiles);

  const geometry = adjustments.geometry;
  const straighten = geometry.straighten;
  const rotate90 = geometry.rotate90;

  const renderFrame = useCallback(
    (preview = cropPreview) => {
      const pipe = pipelineRef.current;
      if (!pipe) return;
      const adj = selectAdjustments(useEditor.getState());
      const renderAdj = compareOriginalRef.current
        ? originalPreviewAdjustments(adj)
        : adj;
      pipe.fitToContainer(adj, preview);
      const rect = cropScreenRectRef.current;
      const frame = imageFrame;
      const cropOutRect =
        preview && rect && frame
          ? screenRectToOutputRect(rect, frame.dw, frame.dh)
          : undefined;
      pipe.render(renderAdj, preview, cropOutRect);
    },
    [cropPreview, imageFrame],
  );

  const startCompare = useCallback(() => {
    if (compareOriginalRef.current) return;
    compareOriginalRef.current = true;
    setCompareOriginal(true);
    renderFrame();
  }, [renderFrame]);

  const endCompare = useCallback(() => {
    if (compareTimeoutRef.current) {
      clearTimeout(compareTimeoutRef.current);
      compareTimeoutRef.current = null;
    }
    if (!compareOriginalRef.current) return;
    compareOriginalRef.current = false;
    setCompareOriginal(false);
    renderFrame();
  }, [renderFrame]);

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
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const measureImageFrame = useCallback(() => {
    const el = viewportRef.current;
    if (!el || !image) {
      setImageFrame(null);
      return;
    }
    const frameSize = cropPreview
      ? getFullRotatedPreviewSize(image.width, image.height, {
          ...geometry,
          straighten,
          rotate90,
        })
      : { width: image.width, height: image.height };
    setImageFrame(
      fitImageInBox(
        el.clientWidth,
        el.clientHeight,
        frameSize.width,
        frameSize.height,
      ),
    );
  }, [image, cropPreview, straighten, rotate90]);

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
    if (image) {
      pipe.setImage(image);
    } else {
      pipe.clearImage();
    }
    renderFrame();
  }, [image]);

  useEffect(() => {
    renderFrame();
    setHistogramTick((t) => t + 1);
  }, [adjustments, cropPreview, renderFrame]);

  useEffect(() => {
    if (image) setHistogramTick((t) => t + 1);
  }, [image]);

  useEffect(() => {
    if (!cropPreview) return;
    renderFrame(true);
  }, [cropPreview, imageFrame, renderFrame]);

  useEffect(() => {
    if (!cropPreview || !cropScreenRect) return;
    renderFrame(true);
  }, [cropPreview, cropScreenRect, renderFrame]);

  const handleCropScreenRectChange = useCallback(
    (
      rect: ScreenRect,
      sourceCrop?: Pick<Geometry, "cropX" | "cropY" | "cropW" | "cropH">,
    ) => {
      skipCropResyncRef.current = true;
      cropScreenRectRef.current = rect;
      setCropScreenRect(rect);
      if (sourceCrop) {
        setGeometry(sourceCrop);
        return;
      }
      if (!image || !imageFrame) return;
      const g = selectAdjustments(useEditor.getState()).geometry;
      const { cropX, cropY, cropW, cropH } = screenRectToSourceCrop(
        rect,
        image.width,
        image.height,
        rotationRadians(g),
        imageFrame.dw,
        imageFrame.dh,
      );
      setGeometry({ cropX, cropY, cropW, cropH });
    },
    [image, imageFrame, setGeometry],
  );

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
    if (!cropPreview) return;
    endCompare();
    resetView();
    measureImageFrame();
  }, [cropPreview, endCompare, resetView, measureImageFrame]);

  useLayoutEffect(() => {
    if (!cropPreview || !image || !imageFrame) {
      cropTrackRef.current = null;
      cropScreenRectRef.current = null;
      setCropScreenRect(null);
      return;
    }

    const { dw, dh } = imageFrame;
    const curr = geometry;
    const prev = cropTrackRef.current;

    const rotationChanged =
      !!prev &&
      (prev.geometry.straighten !== curr.straighten ||
        prev.geometry.rotate90 !== curr.rotate90);

    const frameChanged =
      !!prev && (prev.frameW !== dw || prev.frameH !== dh);

    const cropChanged =
      !!prev &&
      (prev.geometry.cropX !== curr.cropX ||
        prev.geometry.cropY !== curr.cropY ||
        prev.geometry.cropW !== curr.cropW ||
        prev.geometry.cropH !== curr.cropH);

    const lockedRect = cropScreenRectRef.current;

    const fitScreenRect = (rect: ScreenRect) =>
      curr.aspectLocked
        ? clampScreenRectPosition(rect, dw, dh)
        : clampScreenRect(rect, dw, dh);

    if (!prev) {
      const initial = fitScreenRect(
        sourceCropToScreenRect(
          curr,
          image.width,
          image.height,
          rotationRadians(curr),
          dw,
          dh,
        ),
      );
      cropScreenRectRef.current = initial;
      setCropScreenRect(initial);
    } else if ((rotationChanged || frameChanged) && lockedRect) {
      let rect = lockedRect;
      if (frameChanged && prev) {
        rect = fitScreenRect(
          scaleScreenRect(lockedRect, prev.frameW, prev.frameH, dw, dh),
        );
        cropScreenRectRef.current = rect;
        setCropScreenRect(rect);
      }
      const { cropX, cropY, cropW, cropH } = screenRectToSourceCrop(
        rect,
        image.width,
        image.height,
        rotationRadians(curr),
        dw,
        dh,
      );
      const changed =
        Math.abs(cropX - curr.cropX) > 1e-6 ||
        Math.abs(cropY - curr.cropY) > 1e-6 ||
        Math.abs(cropW - curr.cropW) > 1e-6 ||
        Math.abs(cropH - curr.cropH) > 1e-6;
      if (changed) {
        skipCropResyncRef.current = true;
        setGeometry({ cropX, cropY, cropW, cropH });
      }
    } else if (cropChanged && !rotationChanged && !frameChanged) {
      if (skipCropResyncRef.current) {
        skipCropResyncRef.current = false;
      } else {
        const synced = fitScreenRect(
          sourceCropToScreenRect(
            curr,
            image.width,
            image.height,
            rotationRadians(curr),
            dw,
            dh,
          ),
        );
        cropScreenRectRef.current = synced;
        setCropScreenRect(synced);
      }
    }

    cropTrackRef.current = { geometry: curr, frameW: dw, frameH: dh };
  }, [cropPreview, image, imageFrame, geometry, setGeometry]);

  useEffect(() => () => endCompare(), [endCompare]);

  useEffect(() => {
    const onResize = () => renderFrame();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [cropPreview]);

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

  return (
    <div
      ref={viewportRef}
      className={cn(
        "group/viewport relative h-full min-h-0 overflow-hidden bg-[repeating-conic-gradient(#1d1d1d_0%_25%,#161616_0%_50%)] bg-size-[24px_24px]",
          dragging &&
            "after:pointer-events-none after:absolute after:inset-2 after:rounded-md after:border-2 after:border-dashed after:border-primary",
          cropPreview && "[&_canvas]:pointer-events-none",
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
        <canvas
          ref={canvasRef}
          className={cn(
            "absolute origin-center",
            cropPreview && imageFrame
              ? null
              : "inset-0 size-full object-contain object-center",
            !cropPreview && !isPanning && "transition-transform duration-150 ease-out",
            image &&
              !cropPreview &&
              zoom > 1 &&
              (isPanning ? "cursor-grabbing" : "cursor-grab"),
          )}
          style={
            cropPreview && imageFrame
              ? {
                  left: imageFrame.ox,
                  top: imageFrame.oy,
                  width: imageFrame.dw,
                  height: imageFrame.dh,
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
        {cropPreview && image && imageFrame && cropScreenRect && (
          <div
            ref={cropOverlayRef}
            className="absolute z-10"
            style={{
              left: imageFrame.ox,
              top: imageFrame.oy,
              width: imageFrame.dw,
              height: imageFrame.dh,
            }}
          >
            <TransformOverlay
              image={image}
              geometry={geometry}
              screenRect={cropScreenRect}
              onScreenRectChange={handleCropScreenRectChange}
              containerRef={cropOverlayRef}
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
