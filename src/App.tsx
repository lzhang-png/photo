import {
  useEditor,
  selectAdjustments,
  selectFilename,
  selectImage,
  selectNeedsReopen,
} from "./state/store";
import { StatusPill } from "./components/StatusPill";
import { Viewport } from "./components/Viewport";
import { Sidebar } from "./components/Sidebar";
import { downloadBlob, exportImage } from "./editor/export";
import { decode } from "./editor/decode";
import { createBatchProgressReporter } from "./editor/decodeProgress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export function App() {
  const image = useEditor(selectImage);
  const filename = useEditor(selectFilename);
  const status = useEditor((s) => s.status);
  const decodeProgress = useEditor((s) => s.decodeProgress);
  const adjustments = useEditor(selectAdjustments);
  const photoOrder = useEditor((s) => s.photoOrder);
  const photos = useEditor((s) => s.photos);
  const needsReopen = useEditor(selectNeedsReopen);
  const resetAdjustments = useEditor((s) => s.resetAdjustments);
  const setStatus = useEditor((s) => s.setStatus);
  const setDecodeProgress = useEditor((s) => s.setDecodeProgress);

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
    const exportList = photoOrder.filter((id) => photos[id]?.sourceFile);
    for (let i = 0; i < exportList.length; i++) {
      const id = exportList[i];
      const photo = photos[id];
      if (!photo?.sourceFile) continue;
      try {
        let pixels = photo.image;
        if (!pixels) {
          setStatus(`Decoding ${photo.filename} (${i + 1}/${exportList.length})…`);
          pixels = await decode(
            photo.sourceFile,
            photo.rawSettings,
            createBatchProgressReporter(
              setDecodeProgress,
              i,
              exportList.length,
              `Decoding ${photo.filename}`,
            ),
          );
          setDecodeProgress(null);
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
        setDecodeProgress(null);
        setStatus(`Export failed ${photo.filename}: ${(err as Error).message}`);
        return;
      }
    }
    setDecodeProgress(null);
    setStatus(`Exported ${done} photo(s)`);
  };

  return (
    <div className="relative grid h-full w-full grid-cols-[1fr_360px] grid-rows-[auto_1fr]">
      <header className="col-span-full flex h-12 shrink-0 items-center gap-2.5 border-b border-border bg-sidebar px-4">
        <span className="text-base font-semibold tracking-wide">Photo</span>
        <Button
          variant="outline"
          onClick={() => document.getElementById("file-input")?.click()}
        >
          Open…
        </Button>
        <Button variant="outline" onClick={resetAdjustments} disabled={!hasCatalog}>
          Reset
        </Button>
        <Separator orientation="vertical" className="mx-1 self-stretch" />
        <div className="flex min-w-0 flex-1 items-center justify-center px-2">
          {status ? (
            <StatusPill status={status} progress={decodeProgress} />
          ) : null}
        </div>
        {needsReopen && (
          <Badge variant="outline" className="border-primary/40 text-primary">
            Re-open files
          </Badge>
        )}
        {filename && (
          <span
            className="max-w-[220px] truncate text-base text-muted-foreground"
            title={filename}
          >
            {filename}
          </span>
        )}
        {photoOrder.length > 1 && (
          <Badge variant="secondary">{photoOrder.length} photos</Badge>
        )}
        <Button
          variant="outline"
          onClick={onExportAll}
          disabled={photoOrder.length === 0}
        >
          Export all
        </Button>
        <Button onClick={onExport} disabled={!image}>
          Export JPEG
        </Button>
      </header>
      <Viewport />
      <Sidebar />
    </div>
  );
}
