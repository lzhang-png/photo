import { Loader2 } from "lucide-react";

import type { DecodeProgress } from "@/editor/decodeProgress";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

export function isStatusLoading(status: string): boolean {
  return status.endsWith("…");
}

export function isPhotoLoadingStatus(status: string | null): boolean {
  if (!status || !isStatusLoading(status)) return false;
  return /^(Decoding|Reprocessing RAW)/.test(status);
}

export function StatusPill({
  status,
  progress,
}: {
  status: string;
  progress?: DecodeProgress | null;
}) {
  const loading = isStatusLoading(status);
  const showBar = progress != null && loading;

  return (
    <div
      className={cn(
        "flex h-full w-full min-w-0 flex-col justify-center gap-1.5 text-sm",
        showBar && "w-full",
      )}
      role="status"
      aria-live="polite"
    >
      <div className="flex min-w-0 items-center justify-center gap-2">
        {loading && (
          <Loader2
            className="size-3.5 shrink-0 animate-spin text-muted-foreground"
            aria-hidden
          />
        )}
        <span className="truncate text-center text-foreground">{status}</span>
        {showBar && (
          <span className="shrink-0 tabular-nums text-muted-foreground">
            {Math.round(progress.value * 100)}%
          </span>
        )}
      </div>
      {showBar && <Progress value={progress.value} />}
    </div>
  );
}
