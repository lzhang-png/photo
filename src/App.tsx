import { useCallback, useEffect, useState } from "react";
import { ChevronDown, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuButton,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  useEditor,
  selectAdjustments,
  selectFilename,
  selectImage,
  selectNeedsReopen,
} from "./state/store";
import { StatusPill, isPhotoLoadingStatus } from "./components/StatusPill";
import { PhotoLogo } from "./components/PhotoLogo";
import { Viewport } from "./components/Viewport";
import { Filmstrip } from "./components/Filmstrip";
import { Sidebar } from "./components/Sidebar";
import { SidebarResizeHandle } from "./components/SidebarResizeHandle";
import {
  loadUiPrefs,
  MAX_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
  saveUiPrefs,
} from "./editor/uiPrefs";
import { downloadBlob, downloadZip, exportImage, uniqueFilename } from "./editor/export";
import { pickPhotoFiles, loadDirectoryHandle } from "./editor/fileAccess";
import { decode } from "./editor/decode";
import { createBatchProgressReporter } from "./editor/decodeProgress";

export function App() {
  const image = useEditor(selectImage);
  const filename = useEditor(selectFilename);
  const status = useEditor((s) => s.status);
  const decodeProgress = useEditor((s) => s.decodeProgress);
  const adjustments = useEditor(selectAdjustments);
  const photoOrder = useEditor((s) => s.photoOrder);
  const needsReopen = useEditor(selectNeedsReopen);
  const restoringFiles = useEditor((s) => s.restoringFiles);
  const restoreCachedFiles = useEditor((s) => s.restoreCachedFiles);
  const reopenPhotosFromDirectory = useEditor((s) => s.reopenPhotosFromDirectory);
  const importPhotoFiles = useEditor((s) => s.importPhotoFiles);
  const sourceDirectoryName = useEditor((s) => s.sourceDirectoryName);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const setStatus = useEditor((s) => s.setStatus);
  const setDecodeProgress = useEditor((s) => s.setDecodeProgress);

  const isDimensionStatus = !!status && /^\d+ × \d+$/.test(status);
  const showPhotoLoading =
    restoringFiles ||
    decodeProgress != null ||
    isPhotoLoadingStatus(status);
  const loadingStatus =
    status ?? (restoringFiles ? "Restoring photos…" : null);

  const [sidebarWidth, setSidebarWidth] = useState(
    () => loadUiPrefs().sidebarWidth,
  );

  const commitSidebarWidth = useCallback((width: number) => {
    saveUiPrefs({ sidebarWidth: width });
  }, []);

  useEffect(() => {
    void (async () => {
      await restoreCachedFiles();
      if (!selectNeedsReopen(useEditor.getState())) return;
      const handle = await loadDirectoryHandle();
      if (
        handle &&
        (await handle.queryPermission({ mode: "read" })) === "granted"
      ) {
        await reopenPhotosFromDirectory();
      }
    })();
  }, [restoreCachedFiles, reopenPhotosFromDirectory]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || e.altKey) return;
      const target = e.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT")
      ) {
        return;
      }
      if (e.key === "z" || e.key === "Z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (e.key === "y" || e.key === "Y") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [undo, redo]);

  const onOpen = async () => {
    try {
      const picked = await pickPhotoFiles();
      if (picked === null) {
        document.getElementById("file-input")?.click();
        return;
      }
      await importPhotoFiles(picked);
    } catch (err) {
      setStatus(`Open failed: ${(err as Error).message}`);
    }
  };

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

  const exportAllLabel =
    photoOrder.length === 0
      ? "Export photos"
      : photoOrder.length === 1
        ? "Export 1 photo"
        : `Export ${photoOrder.length} photos`;
  const exportDisabled = photoOrder.length === 0 && !image;

  return (
    <div
      className="relative grid h-full w-full grid-rows-[auto_1fr]"
      style={{ gridTemplateColumns: `1fr ${sidebarWidth}px` }}
    >
      <header className="col-span-full flex shrink-0 items-center gap-2.5 border-b border-border bg-sidebar px-4 py-2">
        <PhotoLogo size="sm" className="mr-2 shrink-0 self-center" />
        <div className="flex min-w-0 flex-1 flex-col items-center justify-center px-2">
          {showPhotoLoading && loadingStatus ? (
            <div className="flex h-[3.25rem] w-full max-w-[min(100%,36rem)] items-center justify-center">
              <StatusPill status={loadingStatus} progress={decodeProgress} />
            </div>
          ) : (
            <div className="flex min-h-[3.25rem] w-full max-w-[min(100%,36rem)] flex-col items-center justify-center gap-2 leading-none">
              {filename ? (
                <span
                  className="max-w-full truncate text-center text-sm leading-none text-foreground"
                  title={filename}
                >
                  {filename}
                </span>
              ) : null}
              {isDimensionStatus ? (
                <span className="text-center text-xs leading-none tabular-nums text-muted-foreground">
                  {status}
                </span>
              ) : status ? (
                <StatusPill status={status} progress={decodeProgress} />
              ) : null}
            </div>
          )}
        </div>
        {needsReopen && !restoringFiles && (
          <Button
            variant="outline"
            className="max-w-[220px] border-primary/40 text-primary"
            title={
              sourceDirectoryName
                ? `Re-open from ${sourceDirectoryName}. Shift-click to choose a different folder.`
                : "Choose your photo folder once — it will be remembered for one-click re-open."
            }
            onClick={(e) =>
              reopenPhotosFromDirectory({ pickNewFolder: e.shiftKey })
            }
          >
            <span className="truncate">
              Re-open{sourceDirectoryName ? ` · ${sourceDirectoryName}` : ""}
            </span>
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuButton disabled={exportDisabled}>
            <Download className="size-3.5" />
            Export
            <ChevronDown className="size-3.5" />
          </DropdownMenuButton>
          <DropdownMenuContent align="end" className="w-auto min-w-48">
            <DropdownMenuItem
              disabled={photoOrder.length === 0}
              onClick={onExportAll}
            >
              {exportAllLabel}
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!image} onClick={onExport}>
              Export JPEG
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>
      <div className="flex h-full min-h-0 min-w-0 overflow-hidden">
        <Filmstrip onOpen={onOpen} />
        <div className="relative h-full min-h-0 min-w-0 flex-1">
          <Viewport />
        </div>
      </div>
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
