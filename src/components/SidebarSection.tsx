import { ChevronDown } from "lucide-react";
import { useCallback, useState } from "react";
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
  children,
  sectionId,
  defaultOpen = true,
}: {
  title: string;
  hint?: string;
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

  const toggle = useCallback(() => {
    setOpen((wasOpen) => {
      const nextOpen = !wasOpen;
      const prefs = loadUiPrefs();
      const collapsed = new Set(prefs.collapsedSections);
      if (nextOpen) collapsed.delete(id);
      else collapsed.add(id);
      saveUiPrefs({ collapsedSections: [...collapsed] });
      return nextOpen;
    });
  }, [id]);

  return (
    <section className={cn("px-4 pt-4", open && "pb-4")}>
      <div className="group -mx-1 flex min-w-0 items-center gap-1 rounded-md px-1 py-0.5 transition-colors hover:bg-sidebar-accent">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
          aria-expanded={open}
          onClick={toggle}
        >
          <ChevronDown
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-[transform,color] duration-200 group-hover:text-sidebar-accent-foreground",
              !open && "-rotate-90",
            )}
          />
          <h3 className="text-base font-medium uppercase tracking-wider text-muted-foreground transition-colors group-hover:text-sidebar-accent-foreground">
            {title}
          </h3>
        </button>
        {hint ? (
          <InfoTooltip
            text={hint}
            className="shrink-0 text-muted-foreground/70 group-hover:text-sidebar-accent-foreground"
          />
        ) : null}
      </div>
      <div
        className={cn(
          "grid min-h-0 transition-[grid-template-rows] duration-200 ease-out",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div className={cn("min-h-0", open && "mt-3")}>{children}</div>
        </div>
      </div>
      <Separator className={open ? "mt-3" : "mt-4"} />
    </section>
  );
}
