import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useEditor } from "../state/store";

export function Filmstrip() {
  const photoOrder = useEditor((s) => s.photoOrder);
  const photos = useEditor((s) => s.photos);
  const activePhotoId = useEditor((s) => s.activePhotoId);
  const setActivePhoto = useEditor((s) => s.setActivePhoto);
  const removePhoto = useEditor((s) => s.removePhoto);

  if (photoOrder.length === 0) return null;

  return (
    <ScrollArea className="shrink-0 border-t border-border bg-sidebar">
      <div className="flex items-center gap-2 p-2.5">
        {photoOrder.map((id) => {
          const photo = photos[id];
          if (!photo) return null;
          const isActive = id === activePhotoId;
          const needsFile = !photo.sourceFile;
          return (
            <div key={id} className="group relative shrink-0">
              <button
                type="button"
                className={cn(
                  "relative size-[84px] overflow-hidden rounded-md border-2 bg-muted transition-colors",
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
                    className="absolute right-1 bottom-1 left-1 h-5 justify-center px-1 text-[10px] uppercase"
                  >
                    reopen
                  </Badge>
                )}
              </button>
              <Button
                type="button"
                variant="secondary"
                size="icon-sm"
                className={cn(
                  "absolute top-1.5 right-1.5 transition-opacity",
                  isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                )}
                title="Remove from catalog"
                onClick={(e) => {
                  e.stopPropagation();
                  removePhoto(id);
                }}
              >
                <X className="size-4" />
              </Button>
            </div>
          );
        })}
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  );
}
