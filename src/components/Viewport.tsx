import { useEffect, useRef, useState } from "react";
import { Pipeline } from "../editor/pipeline";
import { decode } from "../editor/decode";
import { useEditor } from "../state/store";

export function Viewport() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pipelineRef = useRef<Pipeline | null>(null);
  const [dragging, setDragging] = useState(false);

  const image = useEditor((s) => s.image);
  const adjustments = useEditor((s) => s.adjustments);
  const setImage = useEditor((s) => s.setImage);
  const setStatus = useEditor((s) => s.setStatus);

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
    pipe.fitToContainer();
    pipe.render(adjustments);
  }, [image]);

  useEffect(() => {
    const pipe = pipelineRef.current;
    if (!pipe) return;
    pipe.render(adjustments);
  }, [adjustments]);

  useEffect(() => {
    const onResize = () => {
      const pipe = pipelineRef.current;
      if (!pipe) return;
      pipe.fitToContainer();
      pipe.render(useEditor.getState().adjustments);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    setStatus(`Decoding ${file.name}…`);
    try {
      const decoded = await decode(file);
      setImage(decoded, file.name);
      setStatus(`${decoded.width} × ${decoded.height}`);
    } catch (err) {
      setStatus(`Failed: ${(err as Error).message}`);
    }
  };

  return (
    <div
      className={`viewport ${dragging ? "drag-over" : ""}`}
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
      {!image && (
        <div className="empty">
          <div>Drop a photo here to start</div>
          <div style={{ fontSize: 11 }}>
            JPEG, PNG, WebP, or RAW (CR2, NEF, ARW, DNG, …)
          </div>
        </div>
      )}
      <input
        id="file-input"
        type="file"
        accept="image/*,.cr2,.cr3,.nef,.arw,.dng,.raf,.rw2,.orf,.pef,.srw"
        style={{ display: "none" }}
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  );
}
