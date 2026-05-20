import { Eye, Minus, Plus, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { originalPreviewAdjustments } from "../editor/adjustments";
import { Button } from "@/components/ui/button";
import { decode, isRawFile } from "../editor/decode";
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
import { Filmstrip } from "./Filmstrip";
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
  const [dragging, setDragging] = useState(false);
  const [compareOriginal, setCompareOriginal] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Pan>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const cropPreview = useEditor((s) => s.cropEditing);

  const image = useEditor(selectImage);
  const adjustments = useEditor(selectAdjustments);
  const sourceFile = useEditor(selectSourceFile);
  const isRaw = useEditor(selectIsRaw);
  const rawSettings = useEditor(selectRawSettings);
  const activePhotoId = useEditor((s) => s.activePhotoId);
  const addPhoto = useEditor((s) => s.addPhoto);
  const setDecodedImage = useEditor((s) => s.setDecodedImage);
  const setGeometry = useEditor((s) => s.setGeometry);
  const setStatus = useEditor((s) => s.setStatus);
  const setDecodeProgress = useEditor((s) => s.setDecodeProgress);
  const photoOrder = useEditor((s) => s.photoOrder);

  const renderFrame = useCallback(
    (preview = cropPreview) => {
      const pipe = pipelineRef.current;
      if (!pipe) return;
      const adj = selectAdjustments(useEditor.getState());
      const renderAdj = compareOriginalRef.current
        ? originalPreviewAdjustments(adj)
        : adj;
      pipe.fitToContainer(adj, preview);
      pipe.render(renderAdj, preview);
    },
    [cropPreview],
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
  }, [adjustments, cropPreview, renderFrame]);

  useEffect(() => {
    if (!cropPreview) return;
    endCompare();
  }, [cropPreview, endCompare]);

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
  }, [activePhotoId, setDecodedImage, setStatus, setDecodeProgress]);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    for (let i = 0; i < list.length; i++) {
      const file = list[i];
      const raw = isRawFile(file);
      const isLast = i === list.length - 1;
      const statusLabel = raw
        ? `Decoding RAW ${file.name} (${i + 1}/${list.length})…`
        : `Decoding ${file.name} (${i + 1}/${list.length})…`;
      setStatus(statusLabel);
      try {
        const decoded = await decode(
          file,
          undefined,
          createBatchProgressReporter(
            setDecodeProgress,
            i,
            list.length,
            statusLabel.replace(/…$/, ""),
          ),
        );
        addPhoto(decoded, file, raw, isLast);
        if (isLast) {
          setStatus(
            `${decoded.width} × ${decoded.height} · ${list.length} photo(s)`,
          );
        }
      } catch (err) {
        setStatus(`Failed ${file.name}: ${(err as Error).message}`);
        setDecodeProgress(null);
        break;
      }
    }
    setDecodeProgress(null);
  };

  return (
    <div className="flex min-h-0 flex-col overflow-hidden">
      <div
        ref={viewportRef}
        className={cn(
          "group/viewport relative min-h-0 flex-1 overflow-hidden bg-[repeating-conic-gradient(#1d1d1d_0%_25%,#161616_0%_50%)] bg-size-[24px_24px]",
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
            "absolute inset-0 size-full origin-center object-contain object-center",
            !isPanning && "transition-transform duration-150 ease-out",
            image &&
              !cropPreview &&
              zoom > 1 &&
              (isPanning ? "cursor-grabbing" : "cursor-grab"),
          )}
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          }}
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
        {compareOriginal && (
          <div className="pointer-events-none absolute top-3 left-1/2 z-10 -translate-x-1/2 rounded-md bg-black/70 px-2.5 py-1 text-xs font-medium text-white">
            Original
          </div>
        )}
        {cropPreview && image && (
          <TransformOverlay
            image={image}
            geometry={adjustments.geometry}
            onChange={setGeometry}
            containerRef={viewportRef}
          />
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
            <p className="m-0">Re-open photos to continue editing</p>
            <p className="m-0 text-[11px] text-muted-foreground">
              Settings are saved — use Open… and select the same files
            </p>
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
      <Filmstrip />
    </div>
  );
}
