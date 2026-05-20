import { Separator } from "@/components/ui/separator";

export function SidebarSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="px-4 py-4">
      <h3 className="mb-3 text-base font-medium uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      {children}
      <Separator className="mt-3" />
    </section>
  );
}
