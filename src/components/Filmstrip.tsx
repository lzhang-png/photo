import { AlertDialog } from "@base-ui/react/alert-dialog";
import { X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useEditor } from "../state/store";

type HoverState = {
  id: string;
  top: number;
  left: number;
};

/** Keep the X visible while moving from the thumb to the button across the gap. */
const HIDE_DELAY_MS = 80;

export function Filmstrip() {
  const photoOrder = useEditor((s) => s.photoOrder);
  const photos = useEditor((s) => s.photos);
  const activePhotoId = useEditor((s) => s.activePhotoId);
  const setActivePhoto = useEditor((s) => s.setActivePhoto);
  const removePhoto = useEditor((s) => s.removePhoto);
  const clearCatalog = useEditor((s) => s.clearCatalog);
  const setStatus = useEditor((s) => s.setStatus);

  const [hover, setHover] = useState<HoverState | null>(null);
  const [clearOpen, setClearOpen] = useState(false);
  const hideTimerRef = useRef<number | null>(null);
  const hoveredThumbRef = useRef<HTMLElement | null>(null);

  const cancelHide = useCallback(() => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const scheduleHide = useCallback(() => {
    cancelHide();
    hideTimerRef.current = window.setTimeout(() => {
      hideTimerRef.current = null;
      hoveredThumbRef.current = null;
      setHover(null);
    }, HIDE_DELAY_MS);
  }, [cancelHide]);

  useEffect(() => cancelHide, [cancelHide]);

  const syncHoverPosition = useCallback((id: string) => {
    const el = hoveredThumbRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setHover({
      id,
      top: r.top + r.height / 2,
      left: r.right,
    });
  }, []);

  useEffect(() => {
    if (!hover) return;
    const sync = () => syncHoverPosition(hover.id);
    sync();
    window.addEventListener("scroll", sync, true);
    window.addEventListener("resize", sync);
    return () => {
      window.removeEventListener("scroll", sync, true);
      window.removeEventListener("resize", sync);
    };
  }, [hover?.id, syncHoverPosition]);

  const onThumbEnter = (id: string, target: HTMLElement) => {
    cancelHide();
    hoveredThumbRef.current =
      target.querySelector<HTMLElement>("[data-filmstrip-thumb]") ?? target;
    syncHoverPosition(id);
  };

  const onConfirmClearAll = () => {
    cancelHide();
    setHover(null);
    clearCatalog();
    setStatus("Catalog cleared");
    setClearOpen(false);
  };

  if (photoOrder.length === 0) return null;

  return (
    <>
      <div className="flex h-full w-[76px] shrink-0 flex-col border-r border-border bg-sidebar">
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col items-center gap-1.5 p-1.5 pt-3 pb-1.5">
          {photoOrder.map((id) => {
            const photo = photos[id];
            if (!photo) return null;
            const isActive = id === activePhotoId;
            const needsFile = !photo.sourceFile;
            return (
              <div
                key={id}
                className="relative shrink-0"
                onMouseEnter={(e) => onThumbEnter(id, e.currentTarget)}
                onMouseLeave={scheduleHide}
              >
                <button
                  type="button"
                  data-filmstrip-thumb
                  className={cn(
                    "relative size-16 overflow-hidden rounded-md border-2 bg-muted transition-colors",
                    isActive ? "border-primary" : "border-transparent hover:border-border",
                    needsFile && "opacity-65",
                  )}
                  onClick={() => setActivePhoto(id)}
                  title={photo.filename}
                >
                  {photo.thumbnailUrl ? (
                    <img
                      className="size-full object-cover"
                      src={photo.thumbnailUrl}
                      alt=""
                      draggable={false}
                    />
                  ) : (
                    <span className="block size-full bg-[repeating-conic-gradient(#2a2a2a_0%_25%,#222_0%_50%)] bg-size-[12px_12px]" />
                  )}
                  {needsFile && (
                    <Badge
                      variant="secondary"
                      className="absolute right-0.5 bottom-0.5 left-0.5 h-4 justify-center px-0.5 text-[8px] uppercase"
                    >
                      reopen
                    </Badge>
                  )}
                </button>
              </div>
            );
          })}
          </div>
          <ScrollBar orientation="vertical" />
        </ScrollArea>
        <div className="shrink-0 border-t border-border p-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-full px-1 text-[11px] text-muted-foreground hover:text-destructive active:!translate-y-0"
            onClick={() => setClearOpen(true)}
          >
            Clear all
          </Button>
        </div>
      </div>
      {hover && (
        <Button
          type="button"
          variant="secondary"
          size="icon-sm"
          className="fixed z-50 size-5 -translate-y-1/2 shadow-md active:!-translate-y-1/2"
          style={{ top: hover.top, left: hover.left }}
          title="Remove from catalog"
          onMouseEnter={cancelHide}
          onMouseLeave={scheduleHide}
          onClick={(e) => {
            e.stopPropagation();
            const idToRemove = hover.id;
            cancelHide();
            setHover(null);
            removePhoto(idToRemove);
          }}
        >
          <X className="size-3" />
        </Button>
      )}
      <AlertDialog.Root open={clearOpen} onOpenChange={setClearOpen}>
        <AlertDialog.Portal>
          <AlertDialog.Backdrop className="fixed inset-0 z-[100] bg-black/60 transition-opacity data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
          <AlertDialog.Viewport className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <AlertDialog.Popup className="w-full max-w-sm rounded-lg border border-border bg-popover p-6 text-popover-foreground shadow-lg outline-none data-[ending-style]:scale-95 data-[starting-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 transition-[transform,opacity] duration-100">
              <AlertDialog.Title className="text-base font-semibold">
                Clear all photos?
              </AlertDialog.Title>
              <AlertDialog.Description className="mt-2 text-sm text-muted-foreground">
                Remove all {photoOrder.length} photo
                {photoOrder.length === 1 ? "" : "s"} from the catalog. Edits and
                settings will be lost. This cannot be undone.
              </AlertDialog.Description>
              <div className="mt-6 flex justify-end gap-2">
                <AlertDialog.Close
                  render={
                    <Button type="button" variant="outline" className="active:!translate-y-0">
                      Cancel
                    </Button>
                  }
                />
                <Button
                  type="button"
                  variant="destructive"
                  className="active:!translate-y-0"
                  onClick={onConfirmClearAll}
                >
                  Clear all
                </Button>
              </div>
            </AlertDialog.Popup>
          </AlertDialog.Viewport>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </>
  );
}
