import {
  useEditor,
  selectAdjustments,
  selectFilename,
  selectImage,
  selectNeedsReopen,
} from "./state/store";
import { Viewport } from "./components/Viewport";
import { Sidebar } from "./components/Sidebar";
import { downloadBlob, exportImage } from "./editor/export";
import { decode } from "./editor/decode";
import "./App.css";

export function App() {
  const image = useEditor(selectImage);
  const filename = useEditor(selectFilename);
  const status = useEditor((s) => s.status);
  const adjustments = useEditor(selectAdjustments);
  const photoOrder = useEditor((s) => s.photoOrder);
  const photos = useEditor((s) => s.photos);
  const needsReopen = useEditor(selectNeedsReopen);
  const resetAdjustments = useEditor((s) => s.resetAdjustments);
  const setStatus = useEditor((s) => s.setStatus);

  const hasCatalog = photoOrder.length > 0;

  const onExport = async () => {
    if (!image || !filename) return;
    setStatus("Rendering export…");
    try {
      const blob = await exportImage(image, adjustments, "image/jpeg", 0.92);
      const base = filename.replace(/\.[^.]+$/, "");
      downloadBlob(blob, `${base}-edited.jpg`);
      setStatus(`Exported ${base}-edited.jpg`);
    } catch (err) {
      setStatus(`Export failed: ${(err as Error).message}`);
    }
  };

  const onExportAll = async () => {
    if (photoOrder.length === 0) return;
    setStatus("Exporting all photos…");
    let done = 0;
    for (const id of photoOrder) {
      const photo = photos[id];
      if (!photo?.sourceFile) continue;
      try {
        let pixels = photo.image;
        if (!pixels) {
          pixels = await decode(photo.sourceFile, photo.rawSettings);
        }
        const blob = await exportImage(
          pixels,
          photo.adjustments,
          "image/jpeg",
          0.92,
        );
        const base = photo.filename.replace(/\.[^.]+$/, "");
        downloadBlob(blob, `${base}-edited.jpg`);
        done++;
      } catch (err) {
        setStatus(`Export failed ${photo.filename}: ${(err as Error).message}`);
        return;
      }
    }
    setStatus(`Exported ${done} photo(s)`);
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="title">Photo</div>
        <button onClick={() => document.getElementById("file-input")?.click()}>
          Open…
        </button>
        <button onClick={resetAdjustments} disabled={!hasCatalog}>
          Reset
        </button>
        <div className="spacer" />
        {needsReopen && (
          <span className="topbar-hint">Settings restored — re-open files</span>
        )}
        {filename && <div className="topbar-filename">{filename}</div>}
        {photoOrder.length > 1 && (
          <span className="topbar-count">{photoOrder.length} photos</span>
        )}
        <button onClick={onExportAll} disabled={photoOrder.length === 0}>
          Export all
        </button>
        <button onClick={onExport} disabled={!image}>
          Export JPEG
        </button>
      </header>
      <Viewport />
      <Sidebar />
      {status && <div className="toast">{status}</div>}
    </div>
  );
}
