import { Separator } from "@/components/ui/separator";
import { InfoTooltip } from "@/components/InfoTooltip";

export function SidebarSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="px-4 py-4">
      <div className="mb-3 flex items-center gap-1.5">
        <h3 className="text-base font-medium uppercase tracking-wider text-muted-foreground">
          {title}
        </h3>
        {hint ? <InfoTooltip text={hint} /> : null}
      </div>
      {children}
      <Separator className="mt-3" />
    </section>
  );
}
