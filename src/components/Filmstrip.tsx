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
    <ScrollArea className="h-full w-[76px] shrink-0 border-r border-border bg-sidebar">
      <div className="flex flex-col items-center gap-1.5 p-1.5">
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
              <Button
                type="button"
                variant="secondary"
                size="icon-sm"
                className={cn(
                  "absolute top-1 right-1 size-5 transition-opacity",
                  isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                )}
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
  );
}
