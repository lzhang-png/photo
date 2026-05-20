import { useEffect, useRef, useState } from "react";
import { decode, isRawFile } from "../editor/decode";
import { Pipeline } from "../editor/pipeline";
import {
  selectAdjustments,
  selectImage,
  selectIsRaw,
  selectRawSettings,
  selectSourceFile,
  useEditor,
} from "../state/store";
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
    if (image) pipe.setImage(image);
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
        const decoded = await decode(sourceFile, rawSettings);
        if (cancelled) return;
        setDecodedImage(decoded);
        setStatus(`${decoded.width} × ${decoded.height}`);
      } catch (err) {
        if (!cancelled) {
          setStatus(`RAW failed: ${(err as Error).message}`);
        }
      }
    }, RAW_REDECODE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [rawSettings, sourceFile, isRaw, setDecodedImage, setStatus]);

  useEffect(() => {
    if (!activePhotoId) return;
    const photo = useEditor.getState().photos[activePhotoId];
    if (!photo?.sourceFile || photo.image) return;

    let cancelled = false;
    (async () => {
      setStatus(`Decoding ${photo.filename}…`);
      try {
        const decoded = await decode(photo.sourceFile!, photo.rawSettings);
        if (cancelled) return;
        setDecodedImage(decoded);
        setStatus(`${decoded.width} × ${decoded.height}`);
      } catch (err) {
        if (!cancelled) {
          setStatus(`Failed: ${(err as Error).message}`);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activePhotoId, setDecodedImage, setStatus]);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    for (let i = 0; i < list.length; i++) {
      const file = list[i];
      const raw = isRawFile(file);
      const isLast = i === list.length - 1;
      setStatus(
        raw
          ? `Decoding RAW ${file.name} (${i + 1}/${list.length})…`
          : `Decoding ${file.name} (${i + 1}/${list.length})…`,
      );
      try {
        const decoded = await decode(file);
        addPhoto(decoded, file, raw, isLast);
        if (isLast) {
          setStatus(
            `${decoded.width} × ${decoded.height} · ${list.length} photo(s)`,
          );
        }
      } catch (err) {
        setStatus(`Failed ${file.name}: ${(err as Error).message}`);
        break;
      }
    }
  };

  return (
    <div className="viewport-wrap">
      <div
        ref={viewportRef}
        className={`viewport ${dragging ? "drag-over" : ""}${cropPreview ? " crop-editing" : ""}`}
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
        <canvas ref={canvasRef} />
        {cropPreview && image && (
          <TransformOverlay
            image={image}
            geometry={adjustments.geometry}
            onChange={setGeometry}
            containerRef={viewportRef}
          />
        )}
        {!image && photoOrder.length === 0 && (
          <div className="empty">
            <p>Drop photos here to start</p>
            <p className="empty-hint">
              JPEG, PNG, WebP, or RAW — select multiple files when opening
            </p>
          </div>
        )}
        {!image && photoOrder.length > 0 && (
          <div className="empty">
            <p>Re-open photos to continue editing</p>
            <p className="empty-hint">
              Settings are saved — use Open… and select the same files
            </p>
          </div>
        )}
        <input
          id="file-input"
          type="file"
          multiple
          accept="image/*,.cr2,.cr3,.nef,.arw,.dng,.raf,.rw2,.orf,.pef,.srw"
          style={{ display: "none" }}
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
