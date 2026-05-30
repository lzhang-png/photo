import { ChevronDown } from "lucide-react";
import { useCallback, useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import { InfoTooltip } from "@/components/InfoTooltip";
import { loadUiPrefs, saveUiPrefs } from "../editor/uiPrefs";
import { cn } from "@/lib/utils";

function sectionSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function SidebarSection({
  title,
  hint,
  headerAction,
  children,
  sectionId,
  defaultOpen = true,
}: {
  title: string;
  hint?: string;
  headerAction?: React.ReactNode;
  children: React.ReactNode;
  sectionId?: string;
  defaultOpen?: boolean;
}) {
  const id = sectionId ?? sectionSlug(title);
  const [open, setOpen] = useState(() => {
    const collapsed = loadUiPrefs().collapsedSections;
    if (collapsed.includes(id)) return false;
    return defaultOpen;
  });

  const onOpenChange = useCallback(
    (nextOpen: boolean) => {
      setOpen(nextOpen);
      const prefs = loadUiPrefs();
      const collapsed = new Set(prefs.collapsedSections);
      if (nextOpen) collapsed.delete(id);
      else collapsed.add(id);
      saveUiPrefs({ collapsedSections: [...collapsed] });
    },
    [id],
  );

  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <div className="px-4">
        <div className="group -mx-1 flex min-w-0 items-center gap-1 rounded-md px-1 py-0.5 transition-colors hover:bg-sidebar-accent">
          <CollapsibleTrigger className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
            <ChevronDown
              className={cn(
                "size-4 shrink-0 text-muted-foreground transition-[transform,color] duration-200 group-hover:text-sidebar-accent-foreground",
                !open && "-rotate-90",
              )}
            />
            <h3 className="text-base font-medium uppercase tracking-wider text-muted-foreground transition-colors group-hover:text-sidebar-accent-foreground">
              {title}
            </h3>
          </CollapsibleTrigger>
          {hint || headerAction ? (
            <div className="ml-auto flex shrink-0 items-center gap-2">
              {hint ? (
                <InfoTooltip
                  text={hint}
                  className="shrink-0 text-muted-foreground/70 group-hover:text-sidebar-accent-foreground"
                />
              ) : null}
              {headerAction}
            </div>
          ) : null}
        </div>
        <CollapsibleContent className="min-h-0 overflow-x-visible overflow-y-hidden">
          <div className={cn("min-h-0", open && "mt-3")}>{children}</div>
        </CollapsibleContent>
      </div>
      <Separator className={open ? "my-5" : "my-6"} />
    </Collapsible>
  );
}
