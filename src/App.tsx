import { useEditor } from "./state/store";
import { Viewport } from "./components/Viewport";
import { Sidebar } from "./components/Sidebar";
import { downloadBlob, exportImage } from "./editor/export";
import "./App.css";

export function App() {
  const image = useEditor((s) => s.image);
  const filename = useEditor((s) => s.filename);
  const status = useEditor((s) => s.status);
  const adjustments = useEditor((s) => s.adjustments);
  const resetAdjustments = useEditor((s) => s.resetAdjustments);
  const setStatus = useEditor((s) => s.setStatus);

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

  return (
    <div className="app">
      <header className="topbar">
        <div className="title">Photo</div>
        <button onClick={() => document.getElementById("file-input")?.click()}>
          Open…
        </button>
        <button onClick={resetAdjustments} disabled={!image}>
          Reset
        </button>
        <div className="spacer" />
        {filename && <div style={{ color: "var(--muted)" }}>{filename}</div>}
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
