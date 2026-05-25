import { X } from "lucide-react";
import { useState } from "react";
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
  const [hoverId, setHoverId] = useState<string | null>(null);

  if (photoOrder.length === 0) return null;

  return (
    <ScrollArea className="h-full w-[84px] shrink-0 border-r border-border bg-sidebar">
      <div className="flex flex-col items-center gap-1.5 p-1.5 pt-3">
        {photoOrder.map((id) => {
          const photo = photos[id];
          if (!photo) return null;
          const isActive = id === activePhotoId;
          const needsFile = !photo.sourceFile;
          const showRemove = hoverId === id;
          return (
            <div
              key={id}
              className={cn(
                "flex shrink-0 items-stretch overflow-hidden rounded-md border-2 transition-colors",
                isActive ? "border-primary" : "border-transparent hover:border-border",
              )}
              onMouseEnter={() => setHoverId(id)}
              onMouseLeave={() => setHoverId(null)}
            >
              {showRemove && (
                <Button
                  type="button"
                  variant="secondary"
                  className="h-16 w-5 min-w-5 shrink-0 rounded-none border-0 p-0 shadow-none active:!translate-y-0"
                  title="Remove from catalog"
                  onClick={(e) => {
                    e.stopPropagation();
                    removePhoto(id);
                  }}
                >
                  <X className="size-3" />
                </Button>
              )}
              <button
                type="button"
                className={cn(
                  "relative size-16 shrink-0 overflow-hidden bg-muted",
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
  );
}
