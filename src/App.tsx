import { useCallback, useState } from "react";
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
import { SidebarResizeHandle } from "./components/SidebarResizeHandle";
import {
  loadUiPrefs,
  MAX_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
  saveUiPrefs,
} from "./editor/uiPrefs";
import { downloadBlob, downloadZip, exportImage, uniqueFilename } from "./editor/export";
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
  const needsReopen = useEditor(selectNeedsReopen);
  const resetAdjustments = useEditor((s) => s.resetAdjustments);
  const setStatus = useEditor((s) => s.setStatus);
  const setDecodeProgress = useEditor((s) => s.setDecodeProgress);

  const [sidebarWidth, setSidebarWidth] = useState(
    () => loadUiPrefs().sidebarWidth,
  );

  const commitSidebarWidth = useCallback((width: number) => {
    saveUiPrefs({ sidebarWidth: width });
  }, []);

  const hasCatalog = photoOrder.length > 0;

  const onExport = async () => {
    if (!image || !filename) return;
    setStatus("Rendering export…");
    try {
      const blob = await exportImage(image, adjustments, "image/jpeg", 0.92);
      const base = filename.replace(/\.[^.]+$/, "");
      await downloadBlob(blob, `${base}-edited.jpg`);
      setStatus(`Exported ${base}-edited.jpg`);
    } catch (err) {
      setStatus(`Export failed: ${(err as Error).message}`);
    }
  };

  const onExportAll = async () => {
    const { photoOrder: order, photos: catalog } = useEditor.getState();
    if (order.length === 0) return;

    const exportList = order.filter(
      (id) => catalog[id]?.sourceFile || catalog[id]?.image,
    );
    if (exportList.length === 0) {
      setStatus("No photos ready to export — re-open files first");
      return;
    }

    setStatus(`Exporting ${exportList.length} photo(s)…`);
    let skipped = 0;
    const zipEntries: Record<string, Uint8Array> = {};
    const usedNames = new Set<string>();

    for (let i = 0; i < exportList.length; i++) {
      const id = exportList[i]!;
      const photo = useEditor.getState().photos[id];
      if (!photo) continue;

      try {
        let pixels = photo.image;
        if (!pixels) {
          if (!photo.sourceFile) {
            skipped++;
            continue;
          }
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

        setStatus(`Rendering ${photo.filename} (${i + 1}/${exportList.length})…`);
        const blob = await exportImage(
          pixels,
          photo.adjustments,
          "image/jpeg",
          0.92,
        );
        const base = photo.filename.replace(/\.[^.]+$/, "");
        const filename = uniqueFilename(`${base}-edited.jpg`, usedNames);
        zipEntries[filename] = new Uint8Array(await blob.arrayBuffer());
      } catch (err) {
        setDecodeProgress(null);
        setStatus(`Export failed ${photo.filename}: ${(err as Error).message}`);
        return;
      }
    }

    setDecodeProgress(null);
    const exported = Object.keys(zipEntries).length;
    if (exported === 0) {
      setStatus("No photos ready to export — re-open files first");
      return;
    }

    try {
      if (exported === 1) {
        const [filename] = Object.keys(zipEntries);
        const data = zipEntries[filename]!;
        await downloadBlob(new Blob([data.buffer as ArrayBuffer], { type: "image/jpeg" }), filename);
      } else {
        await downloadZip(zipEntries, "photos-edited.zip");
      }
    } catch (err) {
      setStatus(`Download failed: ${(err as Error).message}`);
      return;
    }

    if (skipped > 0) {
      setStatus(`Exported ${exported} photo(s), skipped ${skipped} without data`);
    } else if (exported === 1) {
      setStatus(`Exported ${Object.keys(zipEntries)[0]}`);
    } else {
      setStatus(`Exported ${exported} photo(s) to photos-edited.zip`);
    }
  };

  return (
    <div
      className="relative grid h-full w-full grid-rows-[auto_1fr]"
      style={{ gridTemplateColumns: `1fr ${sidebarWidth}px` }}
    >
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
      <div className="relative flex h-full min-h-0 flex-col">
        <SidebarResizeHandle
          width={sidebarWidth}
          min={MIN_SIDEBAR_WIDTH}
          max={MAX_SIDEBAR_WIDTH}
          onWidthChange={setSidebarWidth}
          onWidthCommit={commitSidebarWidth}
        />
        <Sidebar />
      </div>
    </div>
  );
}
