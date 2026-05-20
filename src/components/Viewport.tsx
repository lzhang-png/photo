import { useEffect, useRef, useState } from "react";
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

export function Viewport() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const pipelineRef = useRef<Pipeline | null>(null);
  const skipRawRedecodeRef = useRef(true);
  const [dragging, setDragging] = useState(false);
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

  const renderFrame = (preview = cropPreview) => {
    const pipe = pipelineRef.current;
    if (!pipe) return;
    const adj = selectAdjustments(useEditor.getState());
    pipe.fitToContainer(adj, preview);
    pipe.render(adj, preview);
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
  }, [adjustments, cropPreview]);

  useEffect(() => {
    const onResize = () => renderFrame();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [cropPreview]);

  useEffect(() => {
    skipRawRedecodeRef.current = true;
  }, [activePhotoId, sourceFile]);

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
          "relative min-h-0 flex-1 overflow-hidden bg-[repeating-conic-gradient(#1d1d1d_0%_25%,#161616_0%_50%)] bg-size-[24px_24px]",
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
          className="absolute inset-0 size-full object-contain object-center"
        />
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
