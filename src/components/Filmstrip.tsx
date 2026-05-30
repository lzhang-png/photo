import { Plus, X } from "lucide-react";
import { useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useEditor } from "../state/store";

type FilmstripProps = {
  onOpen: () => void | Promise<void>;
};

export function Filmstrip({ onOpen }: FilmstripProps) {
  const photoOrder = useEditor((s) => s.photoOrder);
  const photos = useEditor((s) => s.photos);
  const activePhotoId = useEditor((s) => s.activePhotoId);
  const setActivePhoto = useEditor((s) => s.setActivePhoto);
  const removePhoto = useEditor((s) => s.removePhoto);
  const clearCatalog = useEditor((s) => s.clearCatalog);
  const setStatus = useEditor((s) => s.setStatus);

  const [clearOpen, setClearOpen] = useState(false);

  const onConfirmClearAll = () => {
    clearCatalog();
    setStatus("Catalog cleared");
    setClearOpen(false);
  };

  return (
    <>
      <div className="flex h-full w-[88px] shrink-0 flex-col border-r border-border bg-sidebar">
        <div className="shrink-0 border-b border-border p-1.5">
          <Button
            type="button"
            variant="outline"
            className="h-9 min-h-9 w-full gap-1 px-1 text-[11px] leading-tight"
            onClick={onOpen}
          >
            <Plus className="size-3.5 shrink-0" />
            Photo
          </Button>
        </div>
        {photoOrder.length > 0 ? (
          <>
            <ScrollArea className="min-h-0 flex-1">
              <div className="flex w-full flex-col gap-1.5 p-1.5">
                {photoOrder.map((id) => {
                  const photo = photos[id];
                  if (!photo) return null;
                  const isActive = id === activePhotoId;
                  const needsFile = !photo.sourceFile;
                  return (
                    <div
                      key={id}
                      className="group/thumb relative w-full shrink-0"
                    >
                      <button
                        type="button"
                        data-filmstrip-thumb
                        className={cn(
                          "relative block aspect-square w-full shrink-0 overflow-hidden rounded-md border-2 bg-muted p-0 transition-colors",
                          isActive
                            ? "border-primary"
                            : "border-transparent hover:border-border",
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
                      <Button
                        type="button"
                        variant="secondary"
                        size="icon-sm"
                        className="absolute top-0.5 right-0.5 z-10 size-5 opacity-0 shadow-md transition-opacity group-hover/thumb:opacity-100 focus-visible:opacity-100 active:!translate-y-0"
                        title="Remove from catalog"
                        onClick={(e) => {
                          e.stopPropagation();
                          removePhoto(id);
                        }}
                      >
                        <X className="size-3" />
                      </Button>
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
          </>
        ) : null}
      </div>
      <ConfirmDialog
        open={clearOpen}
        onOpenChange={setClearOpen}
        title="Clear all photos?"
        description={
          <>
            Remove all {photoOrder.length} photo
            {photoOrder.length === 1 ? "" : "s"} from the catalog. Edits and
            settings will be lost. This cannot be undone.
          </>
        }
        confirmLabel="Clear all"
        onConfirm={onConfirmClearAll}
      />
    </>
  );
}
